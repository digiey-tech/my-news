import 'package:flutter/material.dart';

import '../models.dart';
import '../widgets.dart';

class PerspectiveScreen extends StatelessWidget {
  const PerspectiveScreen({super.key, required this.story, required this.analysis, required this.index});
  final StoryDetail story;
  final Analysis analysis;
  final int index;

  @override
  Widget build(BuildContext context) {
    final perspective = analysis.perspectives[index];
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(leading: const BackButton(), title: const Text('Perspective')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const TagChip('AI-generated', ai: true),
                Text('Attributed viewpoint', style: theme.textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 8),
            Text(perspective.name, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            InfoCard(
              title: 'The viewpoint',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(perspective.summary),
                  RefLinks(refs: perspective.refs, urlFor: (ref) => analysis.reference(ref)?.url),
                ],
              ),
            ),
            InfoCard(
              title: 'Evidence and limits',
              child: Text(
                'This summarizes a viewpoint described in the coverage; it is not an endorsement. '
                '${perspective.evidenceLimits}',
              ),
            ),
            const SectionHeader('Supporting coverage'),
            for (final ref in perspective.refs)
              if (analysis.reference(ref) case final reference?)
                ActionRow(
                  label: '[${reference.ref}] ${reference.publisher}',
                  subtitle: reference.title,
                  action: 'Open',
                  onTap: () => openExternal(context, reference.url),
                ),
            if (analysis.perspectives.length > 1) ...[
              const SectionHeader('Other perspectives'),
              for (final (other, p) in analysis.perspectives.indexed)
                if (other != index)
                  ActionRow(
                    icon: Icons.swap_horiz,
                    label: p.name,
                    action: 'Switch',
                    onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute(
                      builder: (_) => PerspectiveScreen(story: story, analysis: analysis, index: other),
                    )),
                  ),
            ],
          ],
        ),
      ),
    );
  }
}
