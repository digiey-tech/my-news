import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../repository.dart';
import '../widgets.dart';
import 'ai_analysis_screen.dart';
import 'publisher_articles_screen.dart';

class StoryDetailScreen extends StatefulWidget {
  const StoryDetailScreen({super.key, required this.repository, required this.storyId, required this.initialHeadline});
  final StoryRepository repository;
  final String storyId;
  final String initialHeadline;

  @override
  State<StoryDetailScreen> createState() => _StoryDetailScreenState();
}

class _StoryDetailScreenState extends State<StoryDetailScreen> {
  Loaded<StoryDetail>? _result;
  LoadError? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await widget.repository.loadStory(widget.storyId);
      if (!mounted) return;
      setState(() {
        _result = result;
        _error = null;
        _loading = false;
      });
    } on LoadError catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Story'),
        actions: [
          IconButton(tooltip: 'Reload story', icon: const Icon(Icons.refresh), onPressed: _loading ? null : _load),
        ],
      ),
      body: SafeArea(child: _body(context)),
    );
  }

  Widget _body(BuildContext context) {
    final result = _result;
    if (result == null) {
      if (_loading) return const LoadingState(message: 'Loading story...');
      return ErrorState(
        icon: _error?.notFound == true ? Icons.history_toggle_off : Icons.wifi_off,
        message: _error?.message ?? 'Could not load this story.',
        onRetry: _error?.notFound == true ? null : _load,
      );
    }
    final story = result.data;
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (result.fromCache) OfflineBanner(cachedAt: result.cachedAt!),
          Text(story.headline, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            '${plural(story.publishers.length, 'publisher')} · ${plural(story.articleCount, 'article')} · latest ${friendlyTime(story.latestArticleAt)}',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          _Overview(story: story, onOpenAnalysis: () => _openAnalysis(story)),

          SectionHeader('Original coverage', subtitle: 'Opens the publisher\'s own article in your browser.'),
          for (final publisher in story.publishers)
            ActionRow(
              icon: Icons.newspaper,
              label: publisher.name,
              subtitle: publisher.articles.length == 1 ? publisher.articles.first.title : '${publisher.articles.length} articles on this story',
              action: publisher.articles.length == 1 ? 'Open' : 'Choose',
              onTap: () => _openPublisher(story, publisher),
            ),

          SectionHeader('Background', subtitle: 'Reference pages matched automatically to this story.'),
          if (story.background.isEmpty)
            NoticeBanner(icon: Icons.info_outline, text: story.backgroundMessage)
          else
            for (final resource in story.background)
              ActionRow(
                icon: Icons.menu_book_outlined,
                label: '${resource.source}: ${resource.title}',
                subtitle: resource.description,
                action: 'Open',
                onTap: () => openExternal(context, resource.url),
              ),

          SectionHeader('AI analysis', subtitle: 'Overview and perspectives generated on the server from this coverage.'),
          ActionRow(
            icon: Icons.auto_awesome_outlined,
            label: 'AI overview and perspectives',
            subtitle: _aiSubtitle(story.ai),
            action: 'View',
            onTap: () => _openAnalysis(story),
          ),
          const SizedBox(height: 12),
          Text(
            'Publisher and background pages open in your browser and need an internet connection. '
            '${story.excerptNotice}',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  String _aiSubtitle(AiInfo ai) {
    switch (ai.status) {
      case 'ready':
        final perspectives = ai.analysis!.perspectivesSupported
            ? plural(ai.analysis!.perspectives.length, 'perspective')
            : 'Insufficient evidence for distinct perspectives';
        return 'AI-generated · ${friendlyTime(ai.analysis!.generatedAt)} · $perspectives';
      case 'outdated':
        return 'AI-generated · outdated, update scheduled';
      case 'failed':
        return 'Unavailable: generation failed in the last update';
      case 'unavailable':
        return 'Unavailable: the coverage it used has expired';
      case 'skipped':
        return 'Not available: only generated for stories with several publishers';
      default:
        return 'Not generated yet: created during the hourly update';
    }
  }

  void _openPublisher(StoryDetail story, PublisherCoverage publisher) {
    if (publisher.articles.length == 1) {
      openExternal(context, publisher.articles.first.url);
    } else {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PublisherArticlesScreen(storyHeadline: story.headline, publisher: publisher),
      ));
    }
  }

  void _openAnalysis(StoryDetail story) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => AiAnalysisScreen(story: story)));
  }
}

/// Story overview: the stored AI overview when available, otherwise a
/// publisher's own feed excerpt, labeled so the two can never be confused.
class _Overview extends StatelessWidget {
  const _Overview({required this.story, required this.onOpenAnalysis});
  final StoryDetail story;
  final VoidCallback onOpenAnalysis;

  @override
  Widget build(BuildContext context) {
    final analysis = story.ai.analysis;
    if (analysis != null) {
      return InfoCard(
        title: 'Story overview',
        tag: 'AI-generated',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (story.ai.status == 'outdated')
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(story.ai.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            Text(analysis.overview),
            RefLinks(refs: analysis.overviewRefs, urlFor: (ref) => analysis.reference(ref)?.url),
          ],
        ),
      );
    }
    final articles = [for (final p in story.publishers) for (final a in p.articles) (p.name, a)]
      ..sort((x, y) => (x.$2.publishedAt ?? DateTime(0)).compareTo(y.$2.publishedAt ?? DateTime(0)));
    final first = articles.firstWhere((entry) => entry.$2.excerpt.isNotEmpty, orElse: () => articles.first);
    return InfoCard(
      title: 'Story overview',
      tag: 'Original wording',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(first.$2.excerpt.isEmpty ? first.$2.title : first.$2.excerpt),
          const SizedBox(height: 6),
          Text('Feed excerpt from ${first.$1}. ${story.ai.message}', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
