# Calendar: Google Meet and Zoom links

The portal calendar works with no setup: organisers paste any meeting link, and every invite is emailed with an `.ics` file so it lands in Gmail, Outlook or Apple Calendar with Yes/No/Maybe buttons. Reminders go out 15 minutes before each meeting.

Connecting Google Meet or Zoom lets the portal create the meeting link itself. Each is optional and independent; an option stays greyed out ("Not set up") in the New meeting dialog until its variables are set in `portal-backend/.env` and the backend is restarted.

## Google Meet

Meetings are created in one Google account's calendar (for example `meetings@inveontechnologies.in`), which is the organiser on Google's side. Attendees get the event in their Google Calendar too.

1. In Google Cloud Console, create a project and enable the **Google Calendar API**.
2. Under **OAuth consent screen**, choose *Internal* if you use Google Workspace (otherwise *External* and add the account as a test user).
3. Under **Credentials**, create an **OAuth client ID** of type *Web application* with the redirect URI `https://developers.google.com/oauthplayground`.
4. Open the [OAuth Playground](https://developers.google.com/oauthplayground), click the gear icon, tick *Use your own OAuth credentials* and paste the client ID and secret. Authorise the scope `https://www.googleapis.com/auth/calendar.events` while signed in as the meetings account, then exchange the code for tokens and copy the **refresh token**.
5. Set:

```
PORTAL_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
PORTAL_GOOGLE_CLIENT_SECRET=...
PORTAL_GOOGLE_REFRESH_TOKEN=...
PORTAL_GOOGLE_CALENDAR_ID=primary
```

For an *External* app in testing mode Google expires refresh tokens after 7 days; publish the app (or use Workspace *Internal*) to keep it working.

## Zoom

1. In the [Zoom App Marketplace](https://marketplace.zoom.us/), choose **Develop → Build App → Server-to-Server OAuth**.
2. Add the scopes `meeting:write:meeting:admin` and `meeting:update:meeting:admin`, `meeting:delete:meeting:admin` (or the older `meeting:write:admin`), then activate the app.
3. Set:

```
PORTAL_ZOOM_ACCOUNT_ID=...
PORTAL_ZOOM_CLIENT_ID=...
PORTAL_ZOOM_CLIENT_SECRET=...
PORTAL_ZOOM_USER=me   # or the email of the Zoom user who should host
```

## What happens where

| Action in the portal | Portal | Google Meet / Zoom |
| --- | --- | --- |
| Create a meeting | Invites in the app and by email (.ics) | Meeting created, link saved |
| Change time, title or people | Updated invite; people asked to answer again if the time moved | Meeting updated |
| Remove someone | They get a cancellation | Attendee list updated (Meet) |
| Cancel | Everyone gets a cancellation | Meeting deleted |

Interviews and task due dates show on the calendar automatically; they are read from recruitment and tasks, not copied.
