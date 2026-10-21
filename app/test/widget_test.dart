import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:my_news/main.dart';
import 'package:my_news/models.dart';
import 'package:my_news/repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

final now = DateTime.utc(2026, 10, 20, 12);
String hoursAgo(num h) => now.subtract(Duration(minutes: (h * 60).round())).toIso8601String();

Map<String, dynamic> listJson() => {
      'server_time': now.toIso8601String(),
      'last_successful_collection_at': hoursAgo(0.5),
      'ordering': 'newest first',
      'stories': [
        {
          'id': 's1',
          'headline': 'Riverton votes to extend bus service',
          'latest_article_at': hoursAgo(2),
          'publisher_count': 3,
          'article_count': 3,
          'publishers': ['BBC News', 'Fox News', 'NPR'],
          'ai_status': 'ready',
        },
        {
          'id': 's2',
          'headline': 'Old story near the boundary',
          'latest_article_at': hoursAgo(167.5),
          'publisher_count': 1,
          'article_count': 1,
          'publishers': ['NPR'],
          'ai_status': 'pending',
        },
      ],
    };

Map<String, dynamic> detailJson() => {
      'id': 's1',
      'headline': 'Riverton votes to extend bus service',
      'latest_article_at': hoursAgo(2),
      'publishers': [
        {
          'name': 'BBC News',
          'articles': [
            {'id': 'a1', 'title': 'BBC title', 'url': 'https://bbc.example/a1', 'excerpt': 'BBC excerpt', 'published_at': hoursAgo(2)},
          ],
        },
        {
          'name': 'NPR',
          'articles': [
            {'id': 'a2', 'title': 'NPR title', 'url': 'https://npr.example/a2', 'excerpt': 'NPR excerpt', 'published_at': hoursAgo(167.5)},
          ],
        },
      ],
      'background': {'status': 'none', 'message': 'No background resource available', 'resources': []},
      'ai': {
        'status': 'ready',
        'label': 'AI-generated',
        'message': '',
        'analysis': {
          'overview': 'The council approved longer bus hours.',
          'overview_refs': [1, 2],
          'agreement': 'Sources agree it passed.',
          'agreement_refs': [1],
          'disagreement': 'None.',
          'disagreement_refs': [],
          'uncertainty': 'Funding.',
          'perspectives_status': 'supported',
          'perspectives': [
            {'id': 'p1', 'name': 'Supporters: access', 'summary': 's', 'evidence_limits': 'e', 'refs': [1]},
            {'id': 'p2', 'name': 'Critics: funding', 'summary': 's', 'evidence_limits': 'e', 'refs': [2]},
          ],
          'references': [
            {'ref': 1, 'article_id': 'a1', 'publisher': 'BBC News', 'title': 'BBC title', 'url': 'https://bbc.example/a1'},
            {'ref': 2, 'article_id': 'a2', 'publisher': 'NPR', 'title': 'NPR title', 'url': 'https://npr.example/a2'},
          ],
          'generated_at': hoursAgo(1),
          'model': 'claude-opus-5-5',
          'version': 1,
          'input_scope': 'RSS feed excerpts',
        },
      },
    };

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('parses story detail including AI references', () {
    final detail = StoryDetail.fromJson(detailJson());
    expect(detail.publishers.length, 2);
    expect(detail.ai.analysis!.perspectives.length, 2);
    expect(detail.ai.analysis!.reference(2)!.publisher, 'NPR');
  });

  test('offline cache hides expired news and AI that depended on it', () async {
    var online = true;
    var clock = now;
    final client = MockClient((request) async {
      if (!online) throw http.ClientException('offline');
      final body = request.url.path.endsWith('/stories') ? listJson() : detailJson();
      return http.Response(jsonEncode(body), 200);
    });
    final repo = StoryRepository(client: client, clock: () => clock);

    expect((await repo.loadStories()).data.stories.length, 2);
    expect((await repo.loadStory('s1')).fromCache, false);

    online = false;
    clock = now.add(const Duration(hours: 1)); // the 167.5-hour items expire
    final list = await repo.loadStories();
    expect(list.fromCache, true);
    expect(list.data.stories.map((s) => s.id), ['s1']);

    final detail = await repo.loadStory('s1');
    expect(detail.fromCache, true);
    expect(detail.data.publishers.map((p) => p.name), ['BBC News']);
    expect(detail.data.ai.status, 'unavailable');
    expect(detail.data.ai.analysis, isNull);
  });

  test('server errors become readable messages, not raw output', () async {
    final repo = StoryRepository(client: MockClient((_) async => http.Response('<html>boom</html>', 502)));
    expect(
      () => repo.loadStories(),
      throwsA(isA<LoadError>().having((e) => e.message, 'message', contains('having trouble'))),
    );
  });

  testWidgets('core workflow: list -> story -> AI analysis -> perspective -> back', (tester) async {
    final client = MockClient((request) async {
      final body = request.url.path.endsWith('/stories') ? listJson() : detailJson();
      return http.Response(jsonEncode(body), 200);
    });
    await tester.pumpWidget(MyNewsApp(repository: StoryRepository(client: client, clock: () => now)));
    await tester.pumpAndSettle();

    expect(find.text('Top stories'), findsOneWidget);
    expect(find.text('Riverton votes to extend bus service'), findsOneWidget);
    expect(find.textContaining('3 publishers'), findsOneWidget);

    await tester.tap(find.text('Riverton votes to extend bus service'));
    await tester.pumpAndSettle();
    expect(find.text('Original coverage'), findsOneWidget);
    expect(find.text('BBC News'), findsOneWidget);
    expect(find.text('No background resource available'), findsOneWidget);
    expect(find.text('AI-generated'), findsWidgets);

    await tester.scrollUntilVisible(find.text('AI overview and perspectives'), 200);
    await tester.tap(find.text('AI overview and perspectives'));
    await tester.pumpAndSettle();
    expect(find.text('Explore perspectives'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Critics: funding'), 200);
    await tester.tap(find.text('Critics: funding'));
    await tester.pumpAndSettle();
    expect(find.text('Evidence and limits'), findsOneWidget);
    expect(find.text('Supporters: access'), findsOneWidget); // switch button

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Top stories'), findsOneWidget);
  });

  testWidgets('connection failure shows a retry state instead of a spinner', (tester) async {
    final client = MockClient((_) async => throw http.ClientException('offline'));
    await tester.pumpWidget(MyNewsApp(repository: StoryRepository(client: client)));
    await tester.pumpAndSettle();
    expect(find.textContaining('No connection'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Try again'), findsOneWidget);
  });
}
