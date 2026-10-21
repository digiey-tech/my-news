// News publishers collected every hour. Each entry is one publisher's public
// RSS feed. Fox News, NPR, and BBC come from the starter project; the others
// add overlapping international coverage so stories can be grouped.
export const FEEDS = [
  { publisher: "Fox News", url: "https://moxie.foxnews.com/google-publisher/latest.xml" },
  { publisher: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { publisher: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { publisher: "The Guardian", url: "https://www.theguardian.com/us-news/rss" },
  { publisher: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { publisher: "CBS News", url: "https://www.cbsnews.com/latest/rss/main" }
];
