/// Build-time configuration. Override when building, for example:
///   flutter build apk --release --dart-define=API_BASE_URL=https://your-api.onrender.com
library;

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://mynews-api.onrender.com',
);

/// Where beta testers send problem reports.
const String feedbackEmail = String.fromEnvironment(
  'FEEDBACK_EMAIL',
  defaultValue: 'mynews-beta@example.edu',
);

const String appVersion = '1.0.0-beta.1';

/// Free hosting tiers can take up to a minute to wake up.
const Duration requestTimeout = Duration(seconds: 70);

/// News older than this is never shown, even from the offline cache.
const Duration retentionWindow = Duration(hours: 168);
