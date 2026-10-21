import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../widgets.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(leading: const BackButton(), title: const Text('About My News')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text('My News $appVersion (beta)', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text(
              'My News groups coverage of the same event from several publishers into one story. '
              'Stories, background links, and AI analysis are prepared once per hour on the My News server '
              'and shared by every reader. The app itself never collects news or runs AI.',
            ),
            const SectionHeader('How to read it'),
            const Text(
              '• "Original wording" marks publisher text from their feeds.\n'
              '• "AI-generated" marks text written by an AI model from those excerpts. It can be wrong; '
              'use the source links to check.\n'
              '• Only the last seven days of news are shown.',
            ),
            const SectionHeader('Report a problem'),
            ActionRow(
              icon: Icons.bug_report_outlined,
              label: 'Email the beta team',
              subtitle: feedbackEmail,
              action: 'Send',
              onTap: () async {
                final messenger = ScaffoldMessenger.of(context);
                final uri = Uri(
                  scheme: 'mailto',
                  path: feedbackEmail,
                  queryParameters: {'subject': 'My News beta $appVersion problem report'},
                );
                final opened = await launchUrl(uri).catchError((_) => false);
                if (!opened) {
                  messenger.showSnackBar(SnackBar(content: Text('No email app found. Please write to $feedbackEmail')));
                }
              },
            ),
            const SizedBox(height: 16),
            Text('Server: $apiBaseUrl', style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
