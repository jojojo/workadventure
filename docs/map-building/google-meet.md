# Google Meet rooms (Eoloa fork)

This fork includes a built-in Google Meet extension. It works on self-hosted instances without the WorkAdventure SaaS Admin API, Google OAuth, or a calendar connection. Google Meet runs in a separate browser tab; the WorkAdventure panel represents your local participation, not the actual call state.

## Configure a room

1. Create a Google Meet meeting and copy its meeting link.
2. Open the WorkAdventure map editor and select or draw an area.
3. Add the **Google Meet** property, set its meeting name and paste its link.
4. Save the map. Remove any Jitsi or LiveKit meeting property from the same area first: an area supports one meeting provider.

Supported links use HTTPS on `meet.google.com`, with a meeting code (`/abc-defg-hij`) or a named meeting (`/lookup/name`). Google account parameters such as `?authuser=1` are preserved. An invalid or missing link displays an explanatory message and cannot be opened.

## Join and return

Entering the area displays the meeting panel. Clicking **Join Google Meet** opens a tab, activates the busy status, releases the WorkAdventure microphone and camera, mutes incoming WorkAdventure conversation audio, and stops WorkAdventure screen sharing. If the browser blocks the tab, the mode does not activate; allow popups and retry.

**Reopen Google Meet** opens another tab with the same link. It does not detect or focus an existing Meet tab.

**End my participation**, leaving the area, removing its property or changing map releases the local meeting mode. Camera, microphone and requested availability settings are not overwritten, so the usual WorkAdventure rules apply again. Screen sharing must be restarted manually.

Hang up separately in Google Meet. WorkAdventure does not observe the Meet tab, its participants, admission, or whether you joined or ended the call. A successfully opened tab is considered local participation even if you do not complete Meet's pre-join screen. No Gemini feature is implemented here: available features come from the Google account and Workspace subscription used in Meet.

## Implementation

The versioned extension is in `play/src/front/ExternalModule/GoogleMeet/`, outside the ignored SaaS `external-modules` directory. `GameScene` registers it for self-hosted and anonymous users. Its area property uses the existing `extensionModule` schema with subtype `googleMeet` and data `{ "title": "Team meeting", "url": "https://meet.google.com/abc-defg-hij" }`.

The `managesMeetingLifecycle` extension flag lets this module activate only after opening a tab. A dedicated media/status overlay avoids changing or restoring shared user preference stores. External meeting analytics cover the declared participation interval and cannot verify attendance in Meet.

Deploying this extension requires rebuilding Play. Existing map files using `googleMeet` retain their data in the normal map storage format; no backend migration is needed.
