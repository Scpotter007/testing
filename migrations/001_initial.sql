-- Enable PostGIS extension for geospatial operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  bio TEXT,
  birthdate DATE,
  location GEOMETRY(Point, 4326),
  city VARCHAR(100),
  country VARCHAR(100),
  photos JSONB NOT NULL DEFAULT '[]',
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles USING GIST (location);
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token ledger entries (immutable audit log)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id VARCHAR(255),
  reference_type VARCHAR(50),
  balance_after INTEGER NOT NULL,
  description TEXT,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_user_id_idx ON ledger_entries (user_id);
CREATE INDEX IF NOT EXISTS ledger_type_idx ON ledger_entries (type);
CREATE INDEX IF NOT EXISTS ledger_idempotency_idx ON ledger_entries (idempotency_key);

-- Escrows table (locked tokens for pending requests)
CREATE TABLE IF NOT EXISTS escrows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'released', 'finalized')),
  reference_id UUID,
  reference_type VARCHAR(50),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255) UNIQUE
);

CREATE INDEX IF NOT EXISTS escrows_user_id_idx ON escrows (user_id);
CREATE INDEX IF NOT EXISTS escrows_status_idx ON escrows (status);

-- Requests (male to female connection requests)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_amount INTEGER NOT NULL CHECK (token_amount > 0),
  escrow_id UUID REFERENCES escrows(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  message TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key VARCHAR(255) UNIQUE,
  UNIQUE (from_user_id, to_user_id, status)
);

CREATE INDEX IF NOT EXISTS requests_to_user_idx ON requests (to_user_id, status);
CREATE INDEX IF NOT EXISTS requests_from_user_idx ON requests (from_user_id);
CREATE INDEX IF NOT EXISTS requests_expires_idx ON requests (expires_at) WHERE status = 'pending';

-- Vouchers (credit earned from accepted requests)
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  source_request_id UUID REFERENCES requests(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired')),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vouchers_user_id_idx ON vouchers (user_id, status);

-- Conversations (one-to-one chat rooms)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES requests(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  UNIQUE (participant1_id, participant2_id)
);

CREATE INDEX IF NOT EXISTS conversations_p1_idx ON conversations (participant1_id);
CREATE INDEX IF NOT EXISTS conversations_p2_idx ON conversations (participant2_id);

-- Messages (encrypted content)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_encrypted TEXT,
  content_iv VARCHAR(64),
  media_key VARCHAR(255),
  message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id);

-- Media files (secure access)
CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  encryption_key_id VARCHAR(255),
  access_mode VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (access_mode IN ('public', 'private', 'conversation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_files_uploader_idx ON media_files (uploader_id);
CREATE INDEX IF NOT EXISTS media_files_conversation_idx ON media_files (conversation_id);

-- Meetups (QR-based in-person meeting verification)
-- qr_token_hash stores only the SHA-256 hash of the token; plaintext is never persisted.
CREATE TABLE IF NOT EXISTS meetups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qr_token_hash VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'cancelled')),
  initiator_lat DOUBLE PRECISION,
  initiator_lng DOUBLE PRECISION,
  partner_lat DOUBLE PRECISION,
  partner_lng DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent multiple concurrent pending meetups between the same pair of users
CREATE UNIQUE INDEX IF NOT EXISTS meetups_pending_pair_idx
  ON meetups (LEAST(initiator_id::text, partner_id::text), GREATEST(initiator_id::text, partner_id::text))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS meetups_initiator_idx ON meetups (initiator_id);
CREATE INDEX IF NOT EXISTS meetups_partner_idx ON meetups (partner_id);
CREATE INDEX IF NOT EXISTS meetups_qr_token_idx ON meetups (qr_token_hash);
CREATE INDEX IF NOT EXISTS meetups_status_idx ON meetups (status);

-- Meeting rewards (uniqueness enforcement for first-meeting bonus)
CREATE TABLE IF NOT EXISTS meeting_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meetup_id UUID NOT NULL REFERENCES meetups(id),
  rewarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  UNIQUE (user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS meeting_rewards_users_idx ON meeting_rewards (user1_id, user2_id);

-- Audit events
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  data JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_user_idx ON audit_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_type_idx ON audit_events (event_type, created_at);

-- Payment orders
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_order_id VARCHAR(255),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  token_amount INTEGER NOT NULL CHECK (token_amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  metadata JSONB,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON payment_orders (user_id);
CREATE INDEX IF NOT EXISTS payment_orders_provider_idx ON payment_orders (provider, provider_order_id);
