import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../widgets.dart';
import 'perspective_screen.dart';

/// Shows the stored, server-generated analysis. Opening this screen never
/// triggers AI generation; it only displays what the server already saved.
class AiAnalysisScreen extends StatelessWidget {
  const AiAnalysisScreen({super.key, required this.story});
  final StoryDetail story;

  @override
  Widget build(BuildContext context) {
    final ai = story.ai;
    final analysis = ai.analysis;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(leading: const BackButton(), title: const Text('AI analysis')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(story.headline, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (analysis == null)
              ..._unavailable(context, ai)
            else ...[
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const TagChip('AI-generated', ai: true),
                  Text('Generated ${friendlyTime(analysis.generatedAt)}', style: theme.textTheme.bodySmall),
                ],
              ),
              const SizedBox(height: 12),
              if (ai.status == 'outdated') NoticeBanner(icon: Icons.update, warning: true, text: ai.message),
              InfoCard(
                title: 'Overview',
                child: _TextWithRefs(text: analysis.overview, refs: analysis.overviewRefs, analysis: analysis),
              ),
              InfoCard(
                title: 'Agreement and uncertainty',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _TextWithRefs(text: analysis.agreement, refs: analysis.agreementRefs, analysis: analysis),
                    const SizedBox(height: 10),
                    Text('Where coverage differs', style: theme.textTheme.labelLarge),
                    _TextWithRefs(text: analysis.disagreement, refs: analysis.disagreementRefs, analysis: analysis),
                    const SizedBox(height: 10),
                    Text('Still uncertain', style: theme.textTheme.labelLarge),
                    Text(analysis.uncertainty.isEmpty ? 'Not stated.' : analysis.uncertainty),
                    const SizedBox(height: 8),
                    Text('Agreement among sources is not proof that a claim is true.', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              const SectionHeader('Explore perspectives'),
              if (!analysis.perspectivesSupported || analysis.perspectives.isEmpty)
                const NoticeBanner(icon: Icons.balance, text: 'Insufficient evidence for distinct perspectives.')
              else
                for (final (index, perspective) in analysis.perspectives.indexed)
                  ActionRow(
                    icon: Icons.forum_outlined,
                    label: perspective.name,
                    subtitle: 'Supported by ${plural(perspective.refs.length, 'article')}',
                    action: 'View',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => PerspectiveScreen(story: story, analysis: analysis, index: index),
                    )),
                  ),
              const SectionHeader('Supporting articles', subtitle: 'The coverage this analysis was generated from.'),
              for (final ref in analysis.references)
                ActionRow(
                  label: '[${ref.ref}] ${ref.publisher}',
                  subtitle: ref.available ? ref.title : '${ref.title} (no longer available)',
                  action: 'Open',
                  onTap: () => openExternal(context, ref.url),
                ),
              const SizedBox(height: 12),
              Text(
                'Input scope: ${analysis.inputScope.isEmpty ? 'available feed excerpts' : analysis.inputScope}. '
                'Read the original coverage for full context. Model: ${analysis.model}, version ${analysis.version}.',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _unavailable(BuildContext context, AiInfo ai) {
    final title = switch (ai.status) {
      'failed' => 'AI analysis could not be generated',
      'unavailable' => 'AI analysis is being updated',
      'skipped' => 'No AI analysis for single-source stories',
      _ => 'AI analysis not generated yet',
    };
    return [
      InfoCard(title: title, child: Text(ai.message.isEmpty ? 'No AI analysis is available for this story.' : ai.message)),
      const SizedBox(height: 4),
      FilledButton.tonalIcon(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
        label: const Text('Back to original coverage'),
      ),
    ];
  }
}

class _TextWithRefs extends StatelessWidget {
  const _TextWithRefs({required this.text, required this.refs, required this.analysis});
  final String text;
  final List<int> refs;
  final Analysis analysis;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(text.isEmpty ? 'Not stated.' : text),
          RefLinks(refs: refs, urlFor: (ref) => analysis.reference(ref)?.url),
        ],
      );
}
