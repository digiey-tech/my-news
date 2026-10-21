import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../repository.dart';
import '../widgets.dart';
import 'about_screen.dart';
import 'story_detail_screen.dart';

class StoryListScreen extends StatefulWidget {
  const StoryListScreen({super.key, required this.repository});
  final StoryRepository repository;

  @override
  State<StoryListScreen> createState() => _StoryListScreenState();
}

class _StoryListScreenState extends State<StoryListScreen> {
  Loaded<StoryListResponse>? _result;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      if (_result == null) _error = null;
    });
    try {
      final result = await widget.repository.loadStories();
      if (!mounted) return;
      setState(() {
        _result = result;
        _error = null;
        _loading = false;
      });
      if (result.fromCache && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.offlineReason ?? 'Showing saved stories.')));
      }
    } on LoadError catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
      if (_result != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My News'),
        actions: [
          IconButton(
            tooltip: 'Refresh stories',
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
          IconButton(
            tooltip: 'About and feedback',
            icon: const Icon(Icons.info_outline),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AboutScreen())),
          ),
        ],
        bottom: _loading && _result != null
            ? const PreferredSize(preferredSize: Size.fromHeight(3), child: LinearProgressIndicator(minHeight: 3))
            : null,
      ),
      body: SafeArea(child: _body(context)),
    );
  }

  Widget _body(BuildContext context) {
    final result = _result;
    if (result == null) {
      if (_loading) {
        return const LoadingState(message: 'Loading top stories...\nIf the server was asleep this can take up to a minute.');
      }
      return ErrorState(message: _error ?? 'Could not load stories.', onRetry: _load);
    }

    final data = result.data;
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          if (result.fromCache) OfflineBanner(cachedAt: result.cachedAt!),
          Text('Top stories', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
            data.lastSuccessfulCollectionAt == null
                ? 'News not collected yet'
                : 'Updated ${friendlyTime(data.lastSuccessfulCollectionAt)} · newest first · last 7 days',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (data.stories.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 48),
              child: ErrorState(
                icon: Icons.inbox_outlined,
                message: result.fromCache
                    ? 'No saved stories are still within the seven-day window. Connect to the internet to load current news.'
                    : 'No stories yet. The server collects news every hour, so check back soon.',
                onRetry: _load,
              ),
            )
          else
            for (final story in data.stories) _StoryCard(story: story, onTap: () => _open(story)),
        ],
      ),
    );
  }

  void _open(StorySummary story) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => StoryDetailScreen(repository: widget.repository, storyId: story.id, initialHeadline: story.headline),
    ));
  }
}

class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.story, required this.onTap});
  final StorySummary story;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final multi = story.publisherCount > 1;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: multi ? theme.colorScheme.primary.withValues(alpha: 0.5) : theme.colorScheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(story.headline, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(
                '${plural(story.publisherCount, 'publisher')} | ${friendlyTime(story.latestArticleAt)}',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 4),
              Text(
                story.publishers.join(' · '),
                style: theme.textTheme.bodySmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
