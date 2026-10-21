import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../widgets.dart';

/// Chooser shown when one publisher has several articles on the same story.
class PublisherArticlesScreen extends StatelessWidget {
  const PublisherArticlesScreen({super.key, required this.storyHeadline, required this.publisher});
  final String storyHeadline;
  final PublisherCoverage publisher;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(leading: const BackButton(), title: Text(publisher.name)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text('${publisher.name} coverage of', style: theme.textTheme.bodyMedium),
            Text(storyHeadline, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            for (final article in publisher.articles)
              InfoCard(
                title: article.title,
                tag: 'Original wording',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${friendlyTime(article.publishedAt)}${article.publishedAtEstimated ? ' (time first seen; feed gave no date)' : ''}',
                      style: theme.textTheme.bodySmall,
                    ),
                    if (article.excerpt.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(article.excerpt),
                      const SizedBox(height: 4),
                      Text('Feed excerpt, not the full article.', style: theme.textTheme.bodySmall),
                    ],
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonalIcon(
                        onPressed: () => openExternal(context, article.url),
                        icon: const Icon(Icons.open_in_new),
                        label: const Text('Open article'),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
