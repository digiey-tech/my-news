# Grouping examples

## Live data (collected 2026-10-21 ~02:00 UTC)

Output of `node scripts/grouping-report.js` against the live feeds: 226 articles in the 7-day window became 192 stories, 18 of them with two or more publishers. `cos` is the TF-IDF cosine similarity to the matched article; "event" lists the shared non-name words that made the match.

### Same event, different publishers (grouped)

| # | Story | Publishers | Why they matched |
| --- | --- | --- | --- |
| 1 | Prince Harry says he wants to reconcile with the royal family | BBC News (2), CBS News, Fox News | cos 0.55-0.59; names *prince, harry*; event *reconcile, family, royal* |
| 2 | Alberta voters reject independence in referendum | NPR, BBC News, The Guardian (2) | cos 0.26-0.61; names *alberta, canada, carney*; event *reject, independence, referendum* |
| 3 | Florida carries out its 18th execution of the year | Fox News, The Guardian, CBS News | cos 0.40; names *florida, desantis*; event *execution, deputy, death penalty, 18th* |
| 4 | Elon Musk says a Tesla-SpaceX merger is being considered | BBC News, Al Jazeera | cos 0.65; names *elon, musk*; event *merger, company* |
| 5 | UK police re-arrest two men suspected of assisting Iran's intelligence | BBC News, Al Jazeera | cos 0.50; names *uk, iran*; event *men, suspicion, assisting, intelligence, arrested* |
| 6 | Food importer sues Trump over tariffs on Canadian goods | BBC News, Al Jazeera | cos 0.32; names *trump, canadian*; event *tariff, lawsuit* |
| 7 | Tourist convicted of stealing a flamingo from a Las Vegas hotel | BBC News, The Guardian | cos 0.48-0.50; event *found, guilty, enclosure, hotel* |
| 8 | NATO increases Black Sea deployment after drone attacks | The Guardian, Al Jazeera | cos 0.37-0.40; names *nato, black sea*; event *additional, attack, deployment* |
| 9 | Russell Brand rape trial testimony | BBC News, The Guardian | cos 0.53; event *alleged, rape, assault* |

### Related topics that remain separate stories

| # | Article A | Article B | Why they stayed separate |
| --- | --- | --- | --- |
| 1 | BBC/Al Jazeera: "Elon Musk says Tesla-SpaceX merger being considered" | CBS: "Elon Musk chose to restrict Ukraine's use of SpaceX satellite network, sources say" | Same person and company (cos 0.26-0.29, shared names *elon, musk, spacex*), but no shared event word. Before the event-term rule was added these were wrongly merged (see defect D2). |
| 2 | Guardian: "Alabama governor commutes sentence of prisoner on death row" | Guardian/Fox/CBS: "Florida executes man who killed deputy..." | Same topic (death penalty), different state and event. cos 0.18 is below the 0.20 threshold for name-based matches, and they share no specific names. |
| 3 | BBC: "France is divided over who to blame for ... weekend riots" | Al Jazeera: "PSG fans divided over protests in France as Barcelona game goes ahead" | Only *France* is shared (one name); cos 0.19. |

### Grouping mistakes seen in live data

- **Over-grouped:** "Nigeria confirms an Ebola case in Abuja" (NPR, Guardian) was merged with BBC's "Is Ebola under control in Kenya after nine cases confirmed?" (cos 0.33; shared *ebola, kenya, case, confirmed*). The Nigeria excerpt mentions Kenya, so the "different places" guard did not trigger. These are related developments in one outbreak but arguably separate events.
- **Over-grouped:** three articles about Trump's midterm campaign spending and travel (Guardian, Al Jazeera, CBS) form one story.
- **Under-grouped:** BBC "Man charged with attack on Australia MP to face court" and a Guardian live blog on the same case did not merge, because live blogs are treated as multi-topic roundups.

## Fixture data (fictional, clearly labeled)

[server/fixtures/grouping_fixture.json](../server/fixtures/grouping_fixture.json) is fictional demonstration data used by the automated test `same event from different publishers forms one story; related topics stay separate`. It covers the difficult cases deliberately:

| Expected | Articles |
| --- | --- |
| One story (3 publishers) | Riverton bus service: Fox News, NPR, BBC News |
| One story (3 publishers) | Hurricane Delia landfall: NPR, CBS News, The Guardian |
| One story (2 publishers) | Acme Motors SUV recall: BBC News, CBS News |
| One story (2 publishers) | Norland central bank rate rise: The Guardian, Al Jazeera |
| One story (2 publishers) | Pemberton Museum returns bronzes: Fox News, BBC News |
| **Separate**: same person, unrelated events | "Senator Mara Quinn introduces farm subsidy bill" vs "Senator Mara Quinn hospitalized after car accident" |
| **Separate**: same topic, different places | "Wildfire forces evacuations in Oregon's Lane County" vs "Wildfire destroys homes in California's Ventura County" |

Result: `npm test` passes; 16 fixture articles produce exactly 9 stories (5 grouped + 4 separate).
