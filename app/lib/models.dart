// Data classes for the My News API responses (see server README "API").

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

String _str(Object? value, [String fallback = '']) =>
    value is String ? value : fallback;

int _int(Object? value) => value is num ? value.toInt() : 0;

List<T> _list<T>(Object? value, T Function(Map<String, dynamic>) parse) =>
    value is List
        ? value.whereType<Map<String, dynamic>>().map(parse).toList()
        : <T>[];

List<int> _ints(Object? value) =>
    value is List ? value.whereType<num>().map((n) => n.toInt()).toList() : [];

class StoryListResponse {
  StoryListResponse({
    required this.stories,
    required this.lastSuccessfulCollectionAt,
    required this.ordering,
    required this.serverTime,
  });

  final List<StorySummary> stories;
  final DateTime? lastSuccessfulCollectionAt;
  final String ordering;
  final DateTime? serverTime;

  factory StoryListResponse.fromJson(Map<String, dynamic> json) =>
      StoryListResponse(
        stories: _list(json['stories'], StorySummary.fromJson),
        lastSuccessfulCollectionAt: _date(json['last_successful_collection_at']),
        ordering: _str(json['ordering'], 'newest first'),
        serverTime: _date(json['server_time']),
      );
}

class StorySummary {
  StorySummary({
    required this.id,
    required this.headline,
    required this.latestArticleAt,
    required this.publisherCount,
    required this.articleCount,
    required this.publishers,
    required this.aiStatus,
  });

  final String id;
  final String headline;
  final DateTime? latestArticleAt;
  final int publisherCount;
  final int articleCount;
  final List<String> publishers;
  final String aiStatus;

  factory StorySummary.fromJson(Map<String, dynamic> json) => StorySummary(
        id: _str(json['id']),
        headline: _str(json['headline'], 'Untitled story'),
        latestArticleAt: _date(json['latest_article_at']),
        publisherCount: _int(json['publisher_count']),
        articleCount: _int(json['article_count']),
        publishers: json['publishers'] is List
            ? (json['publishers'] as List).whereType<String>().toList()
            : <String>[],
        aiStatus: _str(json['ai_status'], 'pending'),
      );
}

class Article {
  Article({
    required this.id,
    required this.title,
    required this.url,
    required this.excerpt,
    required this.publishedAt,
    required this.publishedAtEstimated,
  });

  final String id;
  final String title;
  final String url;
  final String excerpt;
  final DateTime? publishedAt;
  final bool publishedAtEstimated;

  factory Article.fromJson(Map<String, dynamic> json) => Article(
        id: _str(json['id']),
        title: _str(json['title']),
        url: _str(json['url']),
        excerpt: _str(json['excerpt']),
        publishedAt: _date(json['published_at']),
        publishedAtEstimated: json['published_at_estimated'] == true,
      );
}

class PublisherCoverage {
  PublisherCoverage({required this.name, required this.articles});

  final String name;
  final List<Article> articles;

  factory PublisherCoverage.fromJson(Map<String, dynamic> json) =>
      PublisherCoverage(
        name: _str(json['name']),
        articles: _list(json['articles'], Article.fromJson),
      );
}

class BackgroundResource {
  BackgroundResource({
    required this.title,
    required this.description,
    required this.url,
    required this.source,
  });

  final String title;
  final String description;
  final String url;
  final String source;

  factory BackgroundResource.fromJson(Map<String, dynamic> json) =>
      BackgroundResource(
        title: _str(json['title']),
        description: _str(json['description']),
        url: _str(json['url']),
        source: _str(json['source'], 'Reference'),
      );
}

class Reference {
  Reference({
    required this.ref,
    required this.articleId,
    required this.publisher,
    required this.title,
    required this.url,
    required this.available,
  });

  final int ref;
  final String articleId;
  final String publisher;
  final String title;
  final String url;
  final bool available;

  factory Reference.fromJson(Map<String, dynamic> json) => Reference(
        ref: _int(json['ref']),
        articleId: _str(json['article_id']),
        publisher: _str(json['publisher']),
        title: _str(json['title']),
        url: _str(json['url']),
        available: json['available'] != false,
      );
}

class Perspective {
  Perspective({
    required this.id,
    required this.name,
    required this.summary,
    required this.evidenceLimits,
    required this.refs,
  });

  final String id;
  final String name;
  final String summary;
  final String evidenceLimits;
  final List<int> refs;

  factory Perspective.fromJson(Map<String, dynamic> json) => Perspective(
        id: _str(json['id']),
        name: _str(json['name']),
        summary: _str(json['summary']),
        evidenceLimits: _str(json['evidence_limits']),
        refs: _ints(json['refs']),
      );
}

class Analysis {
  Analysis({
    required this.overview,
    required this.overviewRefs,
    required this.agreement,
    required this.agreementRefs,
    required this.disagreement,
    required this.disagreementRefs,
    required this.uncertainty,
    required this.perspectivesSupported,
    required this.perspectives,
    required this.references,
    required this.generatedAt,
    required this.model,
    required this.version,
    required this.inputScope,
  });

  final String overview;
  final List<int> overviewRefs;
  final String agreement;
  final List<int> agreementRefs;
  final String disagreement;
  final List<int> disagreementRefs;
  final String uncertainty;
  final bool perspectivesSupported;
  final List<Perspective> perspectives;
  final List<Reference> references;
  final DateTime? generatedAt;
  final String model;
  final int version;
  final String inputScope;

  Reference? reference(int ref) {
    for (final r in references) {
      if (r.ref == ref) return r;
    }
    return null;
  }

  factory Analysis.fromJson(Map<String, dynamic> json) => Analysis(
        overview: _str(json['overview']),
        overviewRefs: _ints(json['overview_refs']),
        agreement: _str(json['agreement']),
        agreementRefs: _ints(json['agreement_refs']),
        disagreement: _str(json['disagreement']),
        disagreementRefs: _ints(json['disagreement_refs']),
        uncertainty: _str(json['uncertainty']),
        perspectivesSupported: json['perspectives_status'] == 'supported',
        perspectives: _list(json['perspectives'], Perspective.fromJson),
        references: _list(json['references'], Reference.fromJson),
        generatedAt: _date(json['generated_at']),
        model: _str(json['model']),
        version: _int(json['version']),
        inputScope: _str(json['input_scope']),
      );
}

class AiInfo {
  AiInfo({
    required this.status,
    required this.label,
    required this.message,
    required this.analysis,
  });

  /// ready | outdated | pending | failed | unavailable
  final String status;
  final String label;
  final String message;
  final Analysis? analysis;

  bool get hasAnalysis => analysis != null;

  factory AiInfo.fromJson(Map<String, dynamic>? json) => AiInfo(
        status: _str(json?['status'], 'pending'),
        label: _str(json?['label'], 'AI-generated'),
        message: _str(json?['message']),
        analysis: json?['analysis'] is Map<String, dynamic>
            ? Analysis.fromJson(json!['analysis'] as Map<String, dynamic>)
            : null,
      );
}

class StoryDetail {
  StoryDetail({
    required this.id,
    required this.headline,
    required this.latestArticleAt,
    required this.updatedAt,
    required this.publishers,
    required this.backgroundMessage,
    required this.background,
    required this.ai,
    required this.excerptNotice,
  });

  final String id;
  final String headline;
  final DateTime? latestArticleAt;
  final DateTime? updatedAt;
  final List<PublisherCoverage> publishers;
  final String backgroundMessage;
  final List<BackgroundResource> background;
  final AiInfo ai;
  final String excerptNotice;

  int get articleCount =>
      publishers.fold(0, (sum, p) => sum + p.articles.length);

  factory StoryDetail.fromJson(Map<String, dynamic> json) {
    final background = json['background'] is Map<String, dynamic>
        ? json['background'] as Map<String, dynamic>
        : <String, dynamic>{};
    return StoryDetail(
      id: _str(json['id']),
      headline: _str(json['headline'], 'Untitled story'),
      latestArticleAt: _date(json['latest_article_at']),
      updatedAt: _date(json['updated_at']),
      publishers: _list(json['publishers'], PublisherCoverage.fromJson),
      backgroundMessage:
          _str(background['message'], 'No background resource available'),
      background: _list(background['resources'], BackgroundResource.fromJson),
      ai: AiInfo.fromJson(json['ai'] is Map<String, dynamic>
          ? json['ai'] as Map<String, dynamic>
          : null),
      excerptNotice: _str(json['excerpt_notice']),
    );
  }
}
