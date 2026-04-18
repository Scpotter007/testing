# Dating App MVP

A production-minded Tinder/Bumble-like dating app backend MVP with token economy, escrow requests, geospatial matching, encrypted chat, and QR-based first-meeting rewards.

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 14+ with PostGIS extension
- **Auth**: JWT (HS256)
- **Encryption**: AES-256-CBC for messages
- **Testing**: Jest + ts-jest

### Module Structure

```
src/
├── config/         # Centralized configuration
├── db/             # DB connection pool + migration runner
├── middleware/     # Auth, rate limiting, error handling
├── modules/
│   ├── auth/       # Registration, login, JWT
│   ├── profiles/   # User profiles, photos, location
│   ├── discovery/  # 20km geospatial feed
│   ├── wallet/     # Token balances, ledger, escrow, payments
│   ├── requests/   # Connection requests with escrow
│   ├── chat/       # Encrypted one-to-one messaging
│   └── meetups/    # QR-based in-person meeting + rewards
└── utils/          # Geo, crypto, QR helpers
```

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ with PostGIS extension

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your database credentials
```

### Database Setup

```bash
createdb dating_app
npm run migrate
```

### Running

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

### Testing

```bash
npm test
```

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register + get 50-token bonus |
| POST | `/api/v1/auth/login` | Login |

### Profiles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/profiles/me` | My profile |
| PATCH | `/api/v1/profiles/me` | Update profile + location |
| GET | `/api/v1/profiles/:userId` | View another user's profile |

### Discovery
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/discovery?lat=&lng=` | Get profiles within 20km |

### Wallet
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/wallet/me` | Balance + reserved |
| GET | `/api/v1/wallet/ledger` | Audit ledger entries |
| POST | `/api/v1/wallet/purchase` | Purchase tokens |

### Requests
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/requests` | List requests (sent/received) |
| POST | `/api/v1/requests` | Send request (male→female) with token escrow |
| POST | `/api/v1/requests/:id/respond` | Accept or reject |
| DELETE | `/api/v1/requests/:id` | Cancel request |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/conversations` | List conversations |
| GET | `/api/v1/conversations/:id/messages` | Get messages (decrypted) |
| POST | `/api/v1/conversations/:id/messages` | Send message |
| DELETE | `/api/v1/conversations/:id/messages/:msgId` | Delete message |

### Meetups
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/meetups` | Generate QR for meeting |
| POST | `/api/v1/meetups/verify` | Scan QR + verify proximity |
| PATCH | `/api/v1/meetups/:id/location` | Update initiator GPS |
| GET | `/api/v1/meetups/history` | Meeting history |

## Key Design Decisions

### Token Economy
- Tokens are integer units (no decimals)
- All token operations recorded in an **immutable ledger** for audit
- `wallets.reserved` tracks escrowed tokens, preventing double-spend
- All balance changes use `FOR UPDATE` row locks inside transactions

### Escrow Flow
```
CREATE REQUEST → reserve tokens → escrow.status = 'locked'
ACCEPT         → finalize escrow → debit sender, credit recipient, create voucher
REJECT/CANCEL  → release escrow → restore reserved to available
EXPIRE (cron)  → release escrow → restore reserved to available
```

### Geospatial Matching
- Profiles store location as `GEOMETRY(Point, 4326)` (PostGIS)
- Discovery uses `ST_DWithin` for efficient indexed radius search
- `haversineDistance` utility for application-level checks
- Meeting proximity uses haversine on real-time GPS coordinates

### Encrypted Chat
- Messages are AES-256-CBC encrypted at rest
- Only conversation participants can access messages

### First-Meeting Reward
- `meeting_rewards(user1_id, user2_id)` has a `UNIQUE` constraint
- Canonical pair ordering: `MIN(id) → user1`, `MAX(id) → user2`
- QR tokens are hashed with SHA-256 before storage

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | JWT signing secret |
| `SIGNUP_BONUS_TOKENS` | 50 | Tokens awarded at registration |
| `MEETING_REWARD_TOKENS` | 50 | Tokens for first in-person meeting |
| `MIN_REQUEST_TOKENS` | 10 | Minimum tokens to attach to a request |
| `REQUEST_EXPIRY_HOURS` | 24 | Hours before pending request expires |
| `DISCOVERY_RADIUS_METERS` | 20000 | Discovery feed radius (20km) |
| `MEETING_PROXIMITY_METERS` | 20 | Required proximity for meeting (20m) |
| `QR_TOKEN_TTL_SECONDS` | 300 | QR code validity (5 minutes) |
| `PAYMENT_PROVIDER` | mock | Payment gateway |
| `CHAT_ENCRYPTION_SECRET` | — | AES key for chat encryption |
