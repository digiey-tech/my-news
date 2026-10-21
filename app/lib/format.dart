import 'package:intl/intl.dart';

/// Readable local time: "Today, 9:40 PM", "Yesterday, 8:15 AM", "Mon, Oct 19, 7:02 PM".
String friendlyTime(DateTime? time, {DateTime? now}) {
  if (time == null) return 'Unknown time';
  final local = time.toLocal();
  final current = (now ?? DateTime.now()).toLocal();
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(local.year, local.month, local.day);
  final clock = DateFormat.jm().format(local);
  final diff = today.difference(day).inDays;
  if (diff == 0) return 'Today, $clock';
  if (diff == 1) return 'Yesterday, $clock';
  if (local.year == current.year) return '${DateFormat('EEE, MMM d').format(local)}, $clock';
  return '${DateFormat.yMMMd().format(local)}, $clock';
}

String plural(int count, String singular, [String? pluralForm]) =>
    '$count ${count == 1 ? singular : (pluralForm ?? '${singular}s')}';
