# My News 1.0.0-beta.1: release notes

**For:** limited beta testers · **Platform:** Android (release APK) · **Server:** see the deployed API URL in the README.

## What it does
- **Top stories:** one entry per news event, newest first, from the last seven days. Each entry shows the headline, latest article time, and how many publishers covered it. Pull down or tap ↻ to refresh.
- **Story detail:** a story overview, one button per publisher that covered the story (opens the publisher's own article; a chooser appears if a publisher has several), background reference links, and the AI analysis.
- **AI analysis:** a short overview, what sources agree on, where they differ, what is still uncertain, and distinct viewpoints when the coverage supports them, each with numbered links to the supporting articles. All of it is labeled "AI-generated" with the time it was generated.
- **Offline reading:** the last story list and recently opened stories stay readable without a connection, with a banner showing when they were saved. Expired news is hidden even offline.
- **Publishers:** Fox News, NPR, BBC News, The Guardian, Al Jazeera, CBS News. Collected automatically every hour.

## Known minor issues
- Some separate events on the same subject can be grouped together (for example Ebola cases in two different countries), and occasionally two reports of one event stay separate.
- The first load after a quiet period can take up to a minute while the server wakes up.
- Background links come from Wikipedia and are sometimes general (a country page rather than a specific event).
- New stories may show "AI analysis has not been generated for this story yet" until the next hourly update.

## Service limitations
- AI analyses are written from short feed excerpts, not full articles, and can miss context or contain mistakes. Always check the original coverage.
- Publisher and Wikipedia pages open in your browser and need an internet connection. Some publishers may show paywalls.
- News older than seven days is removed automatically.

## Reporting problems
In the app, tap **ⓘ → Report a problem** to email the beta team, or write to the address configured as `FEEDBACK_EMAIL`. Please include the story headline, what you tapped, what you expected, what happened, and a screenshot if possible.
