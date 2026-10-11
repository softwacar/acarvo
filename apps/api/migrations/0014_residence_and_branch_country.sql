ALTER TABLE "customers" ALTER COLUMN "residency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "residence_country" text;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_country_check" CHECK ("branches"."country" is null or "branches"."country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_residence_country_check" CHECK ("customers"."residence_country" is null or "customers"."residence_country" ~ '^[A-Z]{2}$');