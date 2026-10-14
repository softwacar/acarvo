CREATE TABLE "finance_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finance_id" uuid NOT NULL,
	"charge_no" text NOT NULL,
	"kind" text NOT NULL,
	"quote_id" uuid,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	"tax_minor" bigint,
	"tax_status" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"review_note" text,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"reversal_reason" text,
	"reversal_requested_at" timestamp with time zone,
	"reversal_requested_by" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "finance_charges_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "finance_charges_no_key" UNIQUE("company_id","charge_no"),
	CONSTRAINT "finance_charges_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "finance_charges_no_check" CHECK ("finance_charges"."charge_no" ~ '^H-[0-9]{6,}$'),
	CONSTRAINT "finance_charges_kind_check" CHECK (("finance_charges"."kind" = 'quote') = ("finance_charges"."quote_id" is not null)),
	CONSTRAINT "finance_charges_amount_check" CHECK ("finance_charges"."amount_minor" > 0 and "finance_charges"."amount_minor" <= 100000000000 and "finance_charges"."net_minor" >= 0 and ("finance_charges"."tax_minor" is null or "finance_charges"."tax_minor" >= 0)),
	CONSTRAINT "finance_charges_tax_check" CHECK (("finance_charges"."tax_status" = 'complete') = ("finance_charges"."tax_minor" is not null)),
	CONSTRAINT "finance_charges_currency_check" CHECK ("finance_charges"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "finance_charges_text_check" CHECK (char_length("finance_charges"."description") between 1 and 160 and ("finance_charges"."reason" is null or char_length("finance_charges"."reason") <= 300)),
	CONSTRAINT "finance_charges_four_eyes" CHECK ("finance_charges"."approved_by" is null or "finance_charges"."approved_by" <> "finance_charges"."created_by"),
	CONSTRAINT "finance_charges_reversal_four_eyes" CHECK ("finance_charges"."reversed_by" is null or "finance_charges"."reversed_by" <> "finance_charges"."reversal_requested_by")
);
--> statement-breakpoint
CREATE TABLE "finance_deposit_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"deposit_id" uuid NOT NULL,
	"refund_no" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"review_note" text,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"external_reference" text,
	"cash_ack" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "finance_deposit_refunds_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "finance_deposit_refunds_no_key" UNIQUE("company_id","refund_no"),
	CONSTRAINT "finance_deposit_refunds_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "finance_deposit_refunds_no_check" CHECK ("finance_deposit_refunds"."refund_no" ~ '^DI-[0-9]{6,}$'),
	CONSTRAINT "finance_deposit_refunds_amount_check" CHECK ("finance_deposit_refunds"."amount_minor" > 0 and "finance_deposit_refunds"."amount_minor" <= 100000000000 and "finance_deposit_refunds"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "finance_deposit_refunds_reason_check" CHECK (char_length("finance_deposit_refunds"."reason") between 3 and 300),
	CONSTRAINT "finance_deposit_refunds_completed_check" CHECK ("finance_deposit_refunds"."status" not in ('completed', 'reversed') or ("finance_deposit_refunds"."completed_at" is not null and "finance_deposit_refunds"."completed_by" is not null)),
	CONSTRAINT "finance_deposit_refunds_cash_check" CHECK ("finance_deposit_refunds"."completed_at" is null or ("finance_deposit_refunds"."method" = 'cash') = "finance_deposit_refunds"."cash_ack"),
	CONSTRAINT "finance_deposit_refunds_reference_check" CHECK ("finance_deposit_refunds"."external_reference" is null or (char_length("finance_deposit_refunds"."external_reference") between 3 and 40 and "finance_deposit_refunds"."external_reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$')),
	CONSTRAINT "finance_deposit_refunds_four_eyes" CHECK ("finance_deposit_refunds"."approved_by" is null or "finance_deposit_refunds"."approved_by" <> "finance_deposit_refunds"."created_by")
);
--> statement-breakpoint
CREATE TABLE "finance_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finance_id" uuid NOT NULL,
	"deposit_no" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" text,
	"external_reference" text,
	"cash_ack" boolean DEFAULT false NOT NULL,
	"branch_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"in_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"reported_at" timestamp with time zone,
	"reported_by" uuid,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"closed_reason" text,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "finance_deposits_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "finance_deposits_no_key" UNIQUE("company_id","deposit_no"),
	CONSTRAINT "finance_deposits_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "finance_deposits_no_check" CHECK ("finance_deposits"."deposit_no" ~ '^D-[0-9]{6,}$'),
	CONSTRAINT "finance_deposits_amount_check" CHECK ("finance_deposits"."amount_minor" > 0 and "finance_deposits"."amount_minor" <= 100000000000 and "finance_deposits"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "finance_deposits_reported_check" CHECK ("finance_deposits"."status" in ('requested', 'cancelled') or ("finance_deposits"."method" is not null and "finance_deposits"."reported_at" is not null and "finance_deposits"."reported_by" is not null)),
	CONSTRAINT "finance_deposits_cash_check" CHECK ("finance_deposits"."method" is null or ("finance_deposits"."method" = 'cash') = "finance_deposits"."cash_ack"),
	CONSTRAINT "finance_deposits_reference_check" CHECK (("finance_deposits"."method" is null or "finance_deposits"."method" not in ('external_pos', 'bank_transfer', 'external_card_hold') or "finance_deposits"."external_reference" is not null) and ("finance_deposits"."external_reference" is null or (char_length("finance_deposits"."external_reference") between 3 and 40 and "finance_deposits"."external_reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$'))),
	CONSTRAINT "finance_deposits_review_check" CHECK ("finance_deposits"."in_review" = ("finance_deposits"."review_reason" is not null) and ("finance_deposits"."review_reason" is null or char_length("finance_deposits"."review_reason") between 3 and 300)),
	CONSTRAINT "finance_deposits_four_eyes" CHECK ("finance_deposits"."verified_by" is null or "finance_deposits"."verified_by" <> "finance_deposits"."reported_by")
);
--> statement-breakpoint
CREATE TABLE "finance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finance_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"amount_minor" bigint,
	"currency" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_events_currency_check" CHECK ("finance_events"."currency" is null or "finance_events"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "finance_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finance_id" uuid NOT NULL,
	"payment_no" text NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"payer_type" text NOT NULL,
	"payer_customer_id" uuid,
	"payer_corporate_id" uuid,
	"payer_name" text,
	"external_reference" text,
	"received_at" timestamp with time zone NOT NULL,
	"branch_id" uuid NOT NULL,
	"note" text,
	"cash_ack" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"review_note" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "finance_payments_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "finance_payments_no_key" UNIQUE("company_id","payment_no"),
	CONSTRAINT "finance_payments_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "finance_payments_no_check" CHECK ("finance_payments"."payment_no" ~ '^T-[0-9]{6,}$'),
	CONSTRAINT "finance_payments_amount_check" CHECK ("finance_payments"."amount_minor" > 0 and "finance_payments"."amount_minor" <= 100000000000 and "finance_payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "finance_payments_payer_check" CHECK (("finance_payments"."payer_type" = 'customer' and "finance_payments"."payer_customer_id" is not null and "finance_payments"."payer_corporate_id" is null and "finance_payments"."payer_name" is null) or ("finance_payments"."payer_type" = 'corporate' and "finance_payments"."payer_corporate_id" is not null and "finance_payments"."payer_customer_id" is null and "finance_payments"."payer_name" is null) or ("finance_payments"."payer_type" = 'other' and "finance_payments"."payer_customer_id" is null and "finance_payments"."payer_corporate_id" is null and char_length("finance_payments"."payer_name") between 2 and 80)),
	CONSTRAINT "finance_payments_cash_check" CHECK (("finance_payments"."method" = 'cash') = "finance_payments"."cash_ack"),
	CONSTRAINT "finance_payments_reference_check" CHECK (("finance_payments"."method" not in ('external_pos', 'bank_transfer') or "finance_payments"."external_reference" is not null) and ("finance_payments"."external_reference" is null or (char_length("finance_payments"."external_reference") between 3 and 40 and "finance_payments"."external_reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$'))),
	CONSTRAINT "finance_payments_note_check" CHECK ("finance_payments"."note" is null or char_length("finance_payments"."note") <= 300),
	CONSTRAINT "finance_payments_four_eyes" CHECK ("finance_payments"."verified_by" is null or "finance_payments"."verified_by" <> "finance_payments"."created_by")
);
--> statement-breakpoint
CREATE TABLE "rental_finances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"responsible_type" text NOT NULL,
	"responsible_customer_id" uuid,
	"responsible_corporate_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"reopen_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_finances_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rental_finances_rental_key" UNIQUE("company_id","rental_id"),
	CONSTRAINT "rental_finances_currency_check" CHECK ("rental_finances"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "rental_finances_responsible_check" CHECK (("rental_finances"."responsible_type" = 'customer' and "rental_finances"."responsible_customer_id" is not null and "rental_finances"."responsible_corporate_id" is null) or ("rental_finances"."responsible_type" = 'corporate' and "rental_finances"."responsible_corporate_id" is not null and "rental_finances"."responsible_customer_id" is null)),
	CONSTRAINT "rental_finances_status_check" CHECK ("rental_finances"."status" in ('open', 'closed', 'reopened') and (("rental_finances"."status" = 'closed') = ("rental_finances"."closed_at" is not null))),
	CONSTRAINT "rental_finances_reopen_check" CHECK ("rental_finances"."status" <> 'reopened' or char_length("rental_finances"."reopen_reason") between 3 and 300)
);
--> statement-breakpoint
ALTER TABLE "company_sequences" DROP CONSTRAINT "company_sequences_kind_check";--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_reversal_requested_by_users_id_fk" FOREIGN KEY ("reversal_requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_company_id_finance_id_rental_finances_company_id_id_fk" FOREIGN KEY ("company_id","finance_id") REFERENCES "public"."rental_finances"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_charges" ADD CONSTRAINT "finance_charges_company_id_quote_id_price_quotes_company_id_id_fk" FOREIGN KEY ("company_id","quote_id") REFERENCES "public"."price_quotes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_company_id_deposit_id_finance_deposits_company_id_id_fk" FOREIGN KEY ("company_id","deposit_id") REFERENCES "public"."finance_deposits"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_company_id_finance_id_rental_finances_company_id_id_fk" FOREIGN KEY ("company_id","finance_id") REFERENCES "public"."rental_finances"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_deposits" ADD CONSTRAINT "finance_deposits_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_events" ADD CONSTRAINT "finance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_events" ADD CONSTRAINT "finance_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_events" ADD CONSTRAINT "finance_events_company_id_finance_id_rental_finances_company_id_id_fk" FOREIGN KEY ("company_id","finance_id") REFERENCES "public"."rental_finances"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_company_id_finance_id_rental_finances_company_id_id_fk" FOREIGN KEY ("company_id","finance_id") REFERENCES "public"."rental_finances"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_company_id_payer_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","payer_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_company_id_payer_corporate_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","payer_corporate_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_company_id_responsible_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","responsible_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_finances" ADD CONSTRAINT "rental_finances_company_id_responsible_corporate_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","responsible_corporate_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_charges_quote_key" ON "finance_charges" USING btree ("company_id","finance_id","quote_id") WHERE "finance_charges"."quote_id" is not null and "finance_charges"."status" not in ('rejected', 'reversed');--> statement-breakpoint
CREATE INDEX "finance_charges_finance_idx" ON "finance_charges" USING btree ("company_id","finance_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_charges_status_idx" ON "finance_charges" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "finance_deposit_refunds_deposit_idx" ON "finance_deposit_refunds" USING btree ("company_id","deposit_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_deposit_refunds_status_idx" ON "finance_deposit_refunds" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_deposits_reference_key" ON "finance_deposits" USING btree ("company_id","method","external_reference") WHERE "finance_deposits"."external_reference" is not null and "finance_deposits"."status" in ('reported', 'verified');--> statement-breakpoint
CREATE INDEX "finance_deposits_finance_idx" ON "finance_deposits" USING btree ("company_id","finance_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_deposits_status_idx" ON "finance_deposits" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "finance_events_finance_idx" ON "finance_events" USING btree ("company_id","finance_id","at");--> statement-breakpoint
CREATE INDEX "finance_events_company_idx" ON "finance_events" USING btree ("company_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_events_request_key" ON "finance_events" USING btree ("company_id","client_request_id") WHERE "finance_events"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_payments_reference_key" ON "finance_payments" USING btree ("company_id","method","external_reference") WHERE "finance_payments"."external_reference" is not null and "finance_payments"."status" in ('recorded', 'verified');--> statement-breakpoint
CREATE INDEX "finance_payments_finance_idx" ON "finance_payments" USING btree ("company_id","finance_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_payments_list_idx" ON "finance_payments" USING btree ("company_id","received_at");--> statement-breakpoint
CREATE INDEX "finance_payments_status_idx" ON "finance_payments" USING btree ("company_id","status","received_at");--> statement-breakpoint
CREATE INDEX "finance_payments_payer_customer_idx" ON "finance_payments" USING btree ("company_id","payer_customer_id");--> statement-breakpoint
CREATE INDEX "finance_payments_payer_corporate_idx" ON "finance_payments" USING btree ("company_id","payer_corporate_id");--> statement-breakpoint
CREATE INDEX "rental_finances_customer_idx" ON "rental_finances" USING btree ("company_id","responsible_customer_id");--> statement-breakpoint
CREATE INDEX "rental_finances_corporate_idx" ON "rental_finances" USING btree ("company_id","responsible_corporate_id");--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account', 'reservation', 'rental', 'price_quote', 'contract', 'finance_charge', 'finance_payment', 'finance_deposit', 'finance_refund'));