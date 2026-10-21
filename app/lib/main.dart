import 'package:flutter/material.dart';

import 'repository.dart';
import 'screens/story_list_screen.dart';

void main() {
  runApp(MyNewsApp(repository: StoryRepository()));
}

class MyNewsApp extends StatelessWidget {
  const MyNewsApp({super.key, required this.repository});
  final StoryRepository repository;

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF1F3A5F);
    return MaterialApp(
      title: 'My News',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
        visualDensity: VisualDensity.standard,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: StoryListScreen(repository: repository),
    );
  }
}
