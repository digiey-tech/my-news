import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'models.dart';

/// A readable error for the UI. Never shows raw exception text to readers.
class LoadError implements Exception {
  LoadError(this.message, {this.notFound = false});
  final String message;
  final bool notFound;
  @override
  String toString() => message;
}

/// Result of a load: fresh server data, or cached data while offline.
class Loaded<T> {
  Loaded(this.data, {this.cachedAt, this.offlineReason});
  final T data;
  final DateTime? cachedAt;
  final String? offlineReason;
  bool get fromCache => cachedAt != null;
}

/// Reads stored results from the My News server and keeps an offline copy.
/// The app never fetches news feeds or calls an AI model itself.
class StoryRepository {
  StoryRepository({http.Client? client, DateTime Function()? clock})
      : _client = client ?? http.Client(),
        _now = clock ?? DateTime.now;

  final http.Client _client;
  final DateTime Function() _now;

  static const _listKey = 'cache.stories';
  static const _listTimeKey = 'cache.stories.at';
  static const _detailPrefix = 'cache.story.';
  static const _detailIdsKey = 'cache.story.ids';
  static const _maxCachedDetails = 60;

  Future<Map<String, dynamic>> _getJson(String path) async {
    final uri = Uri.parse('$apiBaseUrl$path');
    final http.Response response;
    try {
      response = await _client.get(uri, headers: {'Accept': 'application/json'}).timeout(requestTimeout);
    } on TimeoutException {
      throw LoadError('The server took too long to respond. Check your connection and try again.');
    } catch (_) {
      // http.ClientException (no network, DNS failure, connection refused).
      throw LoadError('No connection to the My News server. Check your internet connection and try again.');
    }
    if (response.statusCode == 404) {
      throw LoadError('This story is no longer available. It may have expired from the seven-day window.', notFound: true);
    }
    if (response.statusCode != 200) {
      throw LoadError('The My News server is having trouble right now (error ${response.statusCode}). Please try again shortly.');
    }
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map<String, dynamic>) return body;
    } catch (_) {
      // Fall through to the error below.
    }
    throw LoadError('The server sent a response the app could not read. Please try again.');
  }

  Future<Loaded<StoryListResponse>> loadStories() async {
    try {
      final json = await _getJson('/api/stories');
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_listKey, jsonEncode(json));
      await prefs.setString(_listTimeKey, _now().toUtc().toIso8601String());
      return Loaded(StoryListResponse.fromJson(json));
    } on LoadError catch (error) {
      final cached = await _cachedList();
      if (cached != null) {
        return Loaded(cached.$1, cachedAt: cached.$2, offlineReason: error.message);
      }
      rethrow;
    }
  }

  Future<Loaded<StoryDetail>> loadStory(String id) async {
    try {
      final json = await _getJson('/api/stories/${Uri.encodeComponent(id)}');
      await _saveDetail(id, json);
      return Loaded(StoryDetail.fromJson(json));
    } on LoadError catch (error) {
      if (error.notFound) {
        await _removeDetail(id);
        rethrow;
      }
      final cached = await _cachedDetail(id);
      if (cached != null) {
        return Loaded(cached.$1, cachedAt: cached.$2, offlineReason: error.message);
      }
      throw LoadError('${error.message} This story has not been saved for offline reading yet.');
    }
  }

  DateTime get _cutoff => _now().toUtc().subtract(retentionWindow);

  bool _expired(Object? isoDate) {
    final date = isoDate is String ? DateTime.tryParse(isoDate) : null;
    return date == null || date.toUtc().isBefore(_cutoff);
  }

  Future<(StoryListResponse, DateTime)?> _cachedList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_listKey);
    final at = DateTime.tryParse(prefs.getString(_listTimeKey) ?? '');
    if (raw == null || at == null) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      // Hide stories whose newest article has passed the seven-day window.
      final stories = (json['stories'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .where((s) => !_expired(s['latest_article_at']))
          .toList();
      return (StoryListResponse.fromJson({...json, 'stories': stories}), at.toLocal());
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveDetail(String id, Map<String, dynamic> json) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_detailIdsKey) ?? <String>[];
    ids
      ..remove(id)
      ..add(id);
    while (ids.length > _maxCachedDetails) {
      await prefs.remove('$_detailPrefix${ids.removeAt(0)}');
    }
    await prefs.setStringList(_detailIdsKey, ids);
    await prefs.setString('$_detailPrefix$id',
        jsonEncode({'at': _now().toUtc().toIso8601String(), 'story': json}));
  }

  Future<void> _removeDetail(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_detailPrefix$id');
    final ids = prefs.getStringList(_detailIdsKey) ?? <String>[];
    ids.remove(id);
    await prefs.setStringList(_detailIdsKey, ids);
  }

  Future<(StoryDetail, DateTime)?> _cachedDetail(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_detailPrefix$id');
    if (raw == null) return null;
    try {
      final wrapper = jsonDecode(raw) as Map<String, dynamic>;
      final at = DateTime.parse(wrapper['at'] as String).toLocal();
      final pruned = pruneExpiredDetail(wrapper['story'] as Map<String, dynamic>);
      if (pruned == null) return null;
      return (StoryDetail.fromJson(pruned), at);
    } catch (_) {
      return null;
    }
  }

  /// Removes articles older than the retention window from a cached story,
  /// and hides an AI analysis that depended on any removed article.
  /// Returns null if nothing is left.
  Map<String, dynamic>? pruneExpiredDetail(Map<String, dynamic> story) {
    final remainingIds = <String>{};
    final publishers = <Map<String, dynamic>>[];
    for (final publisher in (story['publishers'] as List? ?? []).whereType<Map<String, dynamic>>()) {
      final articles = (publisher['articles'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .where((a) => !_expired(a['published_at']))
          .toList();
      if (articles.isEmpty) continue;
      remainingIds.addAll(articles.map((a) => a['id'] as String? ?? ''));
      publishers.add({...publisher, 'articles': articles});
    }
    if (publishers.isEmpty) return null;

    var ai = story['ai'];
    if (ai is Map<String, dynamic> && ai['analysis'] is Map<String, dynamic>) {
      final refs = ((ai['analysis'] as Map<String, dynamic>)['references'] as List? ?? [])
          .whereType<Map<String, dynamic>>();
      if (refs.any((r) => !remainingIds.contains(r['article_id']))) {
        ai = {
          ...ai,
          'status': 'unavailable',
          'analysis': null,
          'message': 'The saved AI analysis relied on coverage that has since expired, so it is hidden. Connect to the internet to load the current analysis.',
        };
      }
    }
    return {...story, 'publishers': publishers, 'ai': ai};
  }
}
