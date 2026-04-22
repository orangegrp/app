# Privacy Policy

**Service:** app.order332.com  
**Operator:** 332 App (community formerly known as Order 332) — an informal online community, not a registered legal entity  
**Operator location:** United Kingdom  
**Effective date:** 22 April 2026  
**Last updated:** 22 April 2026  
**Contact:** privacy@order332.com | legal@order332.com | Discord (primary)

---

## 1. Introduction

This Privacy Policy explains how 332 App ("we", "us", "our") collects, uses, stores, and protects personal data when you use the 332 App, accessible at **app.order332.com** and the associated public website at **order332.com** (collectively, "the Service").

We are committed to protecting your privacy. This policy is written in accordance with the **UK General Data Protection Regulation (UK GDPR)**, the **Data Protection Act 2018**, and the **EU General Data Protection Regulation (EU GDPR / Regulation 2016/679)**. The Service is used by members from the **United Kingdom, European Union, United States, Canada, and other countries worldwide.** While UK and EU data protection law forms the primary framework of this policy, users in other jurisdictions are also protected by the standards described here.

By using the Service, you acknowledge that you have read and understood this policy.

---

## 2. Who This Applies To

This policy applies to all users of the Service, including:

- Members of the 332 Discord community who access the platform via an invitation
- Users granted access by a platform administrator via a sign-up code

The Service is **invite-only** and not open to the general public. Access requires either membership in the 332 Discord community or a valid administrator-issued invitation code.

**Age requirement:** You must be at least 13 years of age to use the Service. We align our minimum age with Discord's Terms of Service. If you are under 13, you must not use this platform. If we become aware that a user is under 13, their account will be terminated and their data deleted. Some content on the platform may be more suitable for users aged 16 or over and is marked accordingly.

---

## 3. Data Controller

As 332 App is an informal community project with no registered legal entity, the **operators** of the Service (a group of individuals, principally based in the United Kingdom) act as the data controller for the purposes of UK GDPR and EU GDPR.

For data protection enquiries, contact: **privacy@order332.com**

---

## 4. What Data We Collect

### 4.1 Account and Identity Data
- User ID (UUID, internal)
- Display name / username
- Discord user ID and account information (when Discord OAuth is used for login)
- Email address (where provided via OAuth or login flow)
- Authentication credentials: passkey (WebAuthn) public key data, session tokens, magic link records

### 4.2 Session and Security Data
- IP addresses (logged by our infrastructure and by Vercel, our hosting provider)
- Browser user-agent strings
- Login attempt records (successful and failed)
- Session metadata: timestamps, "last seen" records, device/browser indicators

### 4.3 Usage and Activity Data
- Feature usage events collected via **PostHog** (see Section 9)
- AI feature usage records (action type, approximate input size — not content)
- Content creation and upload metadata (filenames, MIME types, sizes, timestamps)
- Invitation records (who invited whom, invite code usage)

### 4.4 User-Generated Content (UGC)
- Files uploaded to the Content Library (documents, images, media)
- Music tracks and playlist data uploaded or created via the Music applet
- Blog posts and associated media created via the Blog Editor applet
- Any other content you choose to create or upload through the Service

### 4.5 Data We Do Not Collect
- Payment information (there are no paid features)
- Government identification
- Sensitive personal data (as defined by UK/EU GDPR Article 9) unless you voluntarily include such information in uploaded content

---

## 5. How We Collect Data

- **Directly from you:** when you register, log in, upload content, or use features of the Service
- **Automatically:** via session management, security logging, and analytics tools
- **From third parties:** via Discord OAuth when you choose to authenticate with Discord

---

## 6. How We Use Your Data

| Purpose | Legal Basis (UK/EU GDPR) |
|---|---|
| Providing and operating the Service | Legitimate interests / Contract performance |
| Authentication and account security | Legitimate interests |
| Detecting and preventing abuse, fraud, or illegal activity | Legitimate interests / Legal obligation |
| Hosting and serving user-generated content | Legitimate interests / Contract performance |
| Improving the Service through anonymised analytics | Legitimate interests (opt-out available) |
| Responding to legal requests or enforcing our policies | Legal obligation / Legitimate interests |
| Notifying you of significant changes to the Service | Legitimate interests |

We do **not** use your data for advertising. We do **not** sell or share your personal data with third parties for marketing purposes.

---

## 7. Data Retention

We retain your personal data indefinitely while your account remains active, unless you request its deletion.

**Specific retention periods:**
- **IP address logs and login attempt records:** Retained for up to **365 days**. Records may be removed sooner through automated or manual system maintenance.
- **Session tokens:** Expire per session or upon logout.
- **Vercel infrastructure logs:** Subject to Vercel's own data retention policies (see Vercel's Privacy Policy).
- **Account and content data:** Retained until account deletion or an erasure request is fulfilled.

---

## 8. Your Rights

Under UK GDPR and EU GDPR, you have the following rights:

- **Right of access** — request a copy of the personal data we hold about you
- **Right to rectification** — request correction of inaccurate data
- **Right to erasure ("right to be forgotten")** — request deletion of your personal data; we will action this upon request
- **Right to restriction of processing** — request that we limit how we use your data
- **Right to data portability** — request your data in a portable format
- **Right to object** — object to processing based on legitimate interests
- **Right to withdraw consent** — where processing is based on consent (e.g. analytics), you may withdraw at any time via in-app Settings

To exercise any of these rights, contact us at **privacy@order332.com** or via Discord. We will respond within **30 days**. Complex requests may take up to **90 days**; we will inform you if this is the case.

**Note on erasure:** Upon account deletion or an erasure request, your personal data will be scheduled for removal. Due to backup cycles and system architecture, data may not be immediately purged from all systems, but will be removed as part of standard maintenance procedures. User-generated content is not automatically removed on account deletion — you must specifically request content removal.

**UK users** may also lodge a complaint with the **Information Commissioner's Office (ICO):** ico.org.uk  
**EU users** may lodge a complaint with their national supervisory authority.  
**Canadian users** may contact the **Office of the Privacy Commissioner of Canada (OPC):** priv.gc.ca  
**US users:** We do not specifically target US residents and do not operate as a business under US law. However, we apply the same privacy standards to all users regardless of location. US users may contact us directly with any privacy concerns.

---

## 9. Analytics — PostHog

We use **PostHog** to collect anonymised usage analytics to understand how the Service is used and to improve it. PostHog may use cookies or browser local storage to track usage events.

**You can opt out of PostHog analytics at any time** via the Settings page within the app. Once opted out, PostHog will not be loaded in your browser session.

For more information, see PostHog's Privacy Policy at posthog.com/privacy.

---

## 10. Cookies and Local Storage

The Service uses:
- **Strictly necessary cookies / tokens:** Session management, authentication (httpOnly cookies). These cannot be disabled without breaking the Service.
- **Analytics storage (PostHog):** Browser local storage flags for analytics opt-out state, and PostHog analytics identifiers if opted in.

We do not use third-party advertising cookies.

---

## 11. Third-Party Services and Subprocessors

We use the following third-party services that may process your personal data. Where possible, we use EU/UK-region infrastructure.

| Service | Purpose | Data Processed | Location |
|---|---|---|---|
| **Supabase** | Database, authentication infrastructure | Account data, session data, content metadata | EU |
| **Vercel** | Hosting, CDN, serverless functions | Request logs, IP addresses | EU/UK + global CDN |
| **Cloudflare R2** | File storage (media, VM disk images) | Uploaded files and media | EU/UK (where configured) |
| **Discord** | OAuth login | Discord user ID, username, email | US |
| **PostHog** | Product analytics | Usage events, anonymised identifiers | EU (EU Cloud) |
| **VirusTotal** | Malware/threat scanning of uploaded files | File content (hash and/or content) | US/Global |
| **ElevenLabs** | AI-powered audio/lyrics processing | Audio data, lyrics input | US |
| **Vercel AI Gateway** | AI feature routing (blog assistant) | AI prompt inputs | US/Global |
| **GitHub (Octokit)** | Blog CMS integration | Blog post content, repository interactions | US |

**Important note on AI subprocessors:** When you use AI-powered features (e.g. blog writing assistant, AI lyrics generation), your inputs may be transmitted to third-party AI providers via Vercel AI Gateway or ElevenLabs. We do not use your inputs to train our own models. However, third-party AI providers may have their own data use and training policies. We select providers that offer data processing agreements or opt-outs where possible, but we cannot guarantee third-party providers will not use your data for model improvement. Avoid entering sensitive personal information in AI feature inputs.

**VirusTotal:** All uploaded files are subject to scanning by VirusTotal. This may include transmission of file content or file hashes to VirusTotal's systems. By uploading files to the Service, you consent to this scanning.

---

## 12. International Data Transfers

Our primary infrastructure is located in the **UK and EU**. Some subprocessors (listed above) are based in or transfer data to the **United States** and other jurisdictions.

Where we transfer data outside the UK/EU, we rely on:
- Standard Contractual Clauses (SCCs) or UK International Data Transfer Agreements (IDTAs) as applicable
- Adequacy decisions where available
- The subprocessor's own compliance frameworks (e.g. EU-US Data Privacy Framework)

---

## 13. Data Security

We take reasonable technical and organisational measures to protect your data, including:
- Encrypted connections (HTTPS/TLS) for all data in transit
- httpOnly, Secure cookies for session tokens
- Role-based access controls within the platform
- EU-region primary database infrastructure
- Malware scanning of uploaded content via VirusTotal

However, no system is completely secure. We cannot guarantee absolute security and are not liable for unauthorised access beyond our reasonable control.

---

## 14. User-Generated Content and Privacy

If you share content publicly via the Service's share features, that content may be accessible to others. You are responsible for any personal data included in content you choose to share publicly or with other users.

---

## 15. Changes to This Policy

We may update this policy from time to time. Significant changes will be announced via Discord and/or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated policy. The "Last updated" date at the top of this document will reflect any changes.

---

## 16. Contact

For privacy-related enquiries:  
**Email:** privacy@order332.com  
**Discord:** Primary contact method — join the 332 community server  
**General/legal enquiries:** legal@order332.com
