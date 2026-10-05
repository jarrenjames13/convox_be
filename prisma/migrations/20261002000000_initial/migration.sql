CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "user_role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'AGENT');
CREATE TYPE "presence_status" AS ENUM ('ONLINE', 'BUSY', 'AWAY', 'OFFLINE');
CREATE TYPE "conversation_status" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "message_direction" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "message_sender_type" AS ENUM ('CUSTOMER', 'AGENT', 'PAGE');
CREATE TYPE "message_type" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'STICKER', 'OTHER');
CREATE TYPE "assignment_type" AS ENUM ('ROUND_ROBIN', 'MANUAL', 'TRANSFER', 'AUTO_REASSIGN', 'REOPEN');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_profiles" (
    "user_id" UUID NOT NULL,
    "presence_status" "presence_status" NOT NULL DEFAULT 'OFFLINE',
    "accepting_conversations" BOOLEAN NOT NULL DEFAULT false,
    "max_active_conversations" INTEGER NOT NULL DEFAULT 10,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "facebook_pages" (
    "id" UUID NOT NULL,
    "meta_page_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(160),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_agents" (
    "page_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_active_conversations" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "page_agents_pkey" PRIMARY KEY ("page_id", "agent_id")
);

CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "meta_psid" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(200),
    "profile_picture_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "meta_conversation_id" VARCHAR(160),
    "assigned_agent_id" UUID,
    "status" "conversation_status" NOT NULL DEFAULT 'UNASSIGNED',
    "assigned_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_response_at" TIMESTAMPTZ(6),
    "last_message_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "meta_message_id" VARCHAR(200),
    "direction" "message_direction" NOT NULL,
    "sender_type" "message_sender_type" NOT NULL,
    "sender_id" UUID,
    "message_type" "message_type" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "metadata" JSONB,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_assignments" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "from_agent_id" UUID,
    "to_agent_id" UUID NOT NULL,
    "assignment_type" "assignment_type" NOT NULL,
    "assigned_by_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "routing_state" (
    "page_id" UUID NOT NULL,
    "last_assigned_agent_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "routing_state_pkey" PRIMARY KEY ("page_id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" VARCHAR(128),
    "user_agent" TEXT,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" VARCHAR(160),
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");
CREATE UNIQUE INDEX "facebook_pages_meta_page_id_key" ON "facebook_pages"("meta_page_id");
CREATE INDEX "page_agents_agent_id_is_enabled_idx" ON "page_agents"("agent_id", "is_enabled");
CREATE INDEX "contacts_page_id_display_name_idx" ON "contacts"("page_id", "display_name");
CREATE UNIQUE INDEX "contacts_page_id_meta_psid_key" ON "contacts"("page_id", "meta_psid");
CREATE INDEX "conversations_page_id_status_last_message_at_idx" ON "conversations"("page_id", "status", "last_message_at");
CREATE INDEX "conversations_assigned_agent_id_status_last_message_at_idx" ON "conversations"("assigned_agent_id", "status", "last_message_at");
CREATE INDEX "conversations_contact_id_status_idx" ON "conversations"("contact_id", "status");
CREATE UNIQUE INDEX "messages_meta_message_id_key" ON "messages"("meta_message_id");
CREATE INDEX "messages_conversation_id_sent_at_id_idx" ON "messages"("conversation_id", "sent_at", "id");
CREATE INDEX "conversation_assignments_conversation_id_created_at_idx" ON "conversation_assignments"("conversation_id", "created_at");
CREATE INDEX "conversation_assignments_to_agent_id_created_at_idx" ON "conversation_assignments"("to_agent_id", "created_at");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

CREATE UNIQUE INDEX "uq_active_contact_conversation"
ON "conversations"("page_id", "contact_id")
WHERE "status" IN ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER');

ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_agents" ADD CONSTRAINT "page_agents_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_agents" ADD CONSTRAINT "page_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_from_agent_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_to_agent_id_fkey" FOREIGN KEY ("to_agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routing_state" ADD CONSTRAINT "routing_state_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routing_state" ADD CONSTRAINT "routing_state_last_assigned_agent_id_fkey" FOREIGN KEY ("last_assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
