# Team calls, voice messages, and location

Staff chat supports direct and group conversations, recorded voice attachments,
one-time location sharing, and voice/video invitations. Conversation membership
and existing RLS control access to messages. Location is requested only when the
user presses **Share current location**; there is no background tracking.

Calls use Jitsi, an open-source WebRTC service. Only the invitation URL is stored
in Postgres. Audio/video streams go to the selected meeting service, keeping
media traffic off Supabase. Both direct and group chats can invite everyone in
the conversation. If a popup is blocked, the sent invitation remains available
as **Join call**. Invitations are saved before opening the call.

The default host is `https://meet.jit.si`. Its operator may require moderator
sign-in to start a meeting. For controlled hosting, set
`NEXT_PUBLIC_TEAM_MEETING_BASE_URL` to the HTTPS URL of a deployed Jitsi server
before building the web app. Credentials, query strings, and URL fragments are
not accepted in this setting. Random room IDs reduce accidental discovery;
Jitsi host authentication and lobby settings control admission. Do not treat
possession of a public room URL as ANSHA role authentication.

The repository does not provision a Jitsi server or TURN service. A two-person
real-device call and group-call test on the chosen host are required before
marking call delivery verified. Customer support remains in the customer portal
and staff support inbox; team call invitations are for internal chat.
