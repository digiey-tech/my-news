import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'format.dart';

/// Opens a publisher or background page in the phone's browser.
Future<void> openExternal(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = Uri.tryParse(url);
  var opened = false;
  if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
  }
  if (!opened) {
    messenger.showSnackBar(const SnackBar(
      content: Text('Could not open the page. Publisher and background pages need an internet connection.'),
    ));
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.primary)),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(subtitle!, style: theme.textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}

/// A full-width, easy-to-tap row button: label on the left, action on the right.
class ActionRow extends StatelessWidget {
  const ActionRow({
    super.key,
    required this.label,
    required this.action,
    required this.onTap,
    this.subtitle,
    this.icon,
  });

  final String label;
  final String? subtitle;
  final String action;
  final IconData? icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: theme.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, color: theme.colorScheme.primary),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(label, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                        if (subtitle != null && subtitle!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(subtitle!, style: theme.textTheme.bodySmall, maxLines: 3, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(action, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.title, required this.child, this.tag});
  final String title;
  final String? tag;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                if (tag != null) TagChip(tag!),
              ],
            ),
            const SizedBox(height: 6),
            child,
          ],
        ),
      ),
    );
  }
}

/// Small label such as "AI-generated" or "Original wording".
class TagChip extends StatelessWidget {
  const TagChip(this.text, {super.key, this.ai = false});
  final String text;
  final bool ai;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = ai ? scheme.tertiaryContainer : scheme.secondaryContainer;
    final foreground = ai ? scheme.onTertiaryContainer : scheme.onSecondaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

/// Banner for offline mode, outdated data, or other notices.
class NoticeBanner extends StatelessWidget {
  const NoticeBanner({super.key, required this.icon, required this.text, this.warning = false});
  final IconData icon;
  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = warning ? scheme.errorContainer : scheme.surfaceContainerHighest;
    final foreground = warning ? scheme.onErrorContainer : scheme.onSurfaceVariant;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: foreground, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: foreground))),
        ],
      ),
    );
  }
}

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.cachedAt});
  final DateTime cachedAt;

  @override
  Widget build(BuildContext context) => NoticeBanner(
        icon: Icons.cloud_off,
        warning: true,
        text: 'Offline mode: showing content saved ${friendlyTime(cachedAt)}. '
            'Expired news is hidden. Publisher pages need a connection.',
      );
}

/// Full-screen error with a retry button (no endless spinners).
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, required this.onRetry, this.icon = Icons.wifi_off});
  final String message;
  final VoidCallback? onRetry;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(message, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}

/// Tappable citation markers such as [1] [2] that open the cited article.
class RefLinks extends StatelessWidget {
  const RefLinks({super.key, required this.refs, required this.urlFor});
  final List<int> refs;
  final String? Function(int ref) urlFor;

  @override
  Widget build(BuildContext context) {
    if (refs.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('Sources:', style: Theme.of(context).textTheme.bodySmall),
          for (final ref in refs)
            ActionChip(
              label: Text('[$ref]'),
              visualDensity: VisualDensity.compact,
              tooltip: 'Open supporting article $ref',
              onPressed: urlFor(ref) == null ? null : () => openExternal(context, urlFor(ref)!),
            ),
        ],
      ),
    );
  }
}
