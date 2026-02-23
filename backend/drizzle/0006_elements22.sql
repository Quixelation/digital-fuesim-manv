CREATE TYPE "public"."exercise_set_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "exercise_element_to_set_mapping" (
	"setEntityId" varchar NOT NULL,
	"setVersionId" varchar NOT NULL,
	"elementEntityId" varchar NOT NULL,
	"elementVersionId" varchar NOT NULL,
	CONSTRAINT "unique_element_set_mapping" UNIQUE("setVersionId","elementVersionId"),
	CONSTRAINT "unique_element_set_mapping_2" UNIQUE("setVersionId","elementEntityId")
);
--> statement-breakpoint
CREATE TABLE "exercise_element_sets" (
	"versionId" varchar PRIMARY KEY NOT NULL,
	"entityId" varchar NOT NULL,
	"version" integer NOT NULL,
	"stateVersion" integer NOT NULL,
	"createdBy" varchar DEFAULT 'unknown' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar NOT NULL,
	"visibility" "exercise_set_visibility" DEFAULT 'private' NOT NULL,
	"owner" varchar NOT NULL,
	CONSTRAINT "exercise_element_sets_versionId_unique" UNIQUE("versionId"),
	CONSTRAINT "unique_set_version" UNIQUE("entityId","version"),
	CONSTRAINT "unique_set_id" UNIQUE("entityId","versionId")
);
--> statement-breakpoint
CREATE TABLE "exercise_element_templates" (
	"versionId" varchar PRIMARY KEY NOT NULL,
	"entityId" varchar NOT NULL,
	"version" integer NOT NULL,
	"stateVersion" integer NOT NULL,
	"createdBy" varchar DEFAULT 'unknown' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar NOT NULL,
	"content" json NOT NULL,
	CONSTRAINT "exercise_element_templates_versionId_unique" UNIQUE("versionId"),
	CONSTRAINT "unique_template_version" UNIQUE("entityId","version"),
	CONSTRAINT "unique_template_id" UNIQUE("entityId","versionId")
);
--> statement-breakpoint
ALTER TABLE "exercise_element_to_set_mapping" ADD CONSTRAINT "exercise_element_to_set_mapping_setVersionId_exercise_element_sets_versionId_fk" FOREIGN KEY ("setVersionId") REFERENCES "public"."exercise_element_sets"("versionId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_element_to_set_mapping" ADD CONSTRAINT "exercise_element_to_set_mapping_elementVersionId_exercise_element_templates_versionId_fk" FOREIGN KEY ("elementVersionId") REFERENCES "public"."exercise_element_templates"("versionId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE VIEW "public"."latest_exercise_element_set_version_numbers" AS (select "entityId", max("version") as "latestversion" from "exercise_element_sets" group by "exercise_element_sets"."entityId");
CREATE VIEW "public"."latest_exercise_element_sets" AS (select "exercise_element_sets"."versionId", "exercise_element_sets"."entityId", "exercise_element_sets"."version", "exercise_element_sets"."stateVersion", "exercise_element_sets"."createdBy", "exercise_element_sets"."createdAt", "exercise_element_sets"."title", "exercise_element_sets"."description", "exercise_element_sets"."visibility", "exercise_element_sets"."owner" from "exercise_element_sets" inner join "latest_exercise_element_set_version_numbers" on ("exercise_element_sets"."entityId" = "latest_exercise_element_set_version_numbers"."entityId" and "exercise_element_sets"."version" = "latestversion"));--> statement-breakpoint
CREATE VIEW "public"."latest_exercise_element_template_version_numbers" AS (select "entityId", max("version") as "latestversion" from "exercise_element_templates" group by "exercise_element_templates"."entityId");--> statement-breakpoint
CREATE VIEW "public"."latest_exercise_element_templates" AS (select "exercise_element_templates"."versionId", "exercise_element_templates"."entityId", "exercise_element_templates"."version", "exercise_element_templates"."stateVersion", "exercise_element_templates"."createdBy", "exercise_element_templates"."createdAt", "exercise_element_templates"."title", "exercise_element_templates"."description", "exercise_element_templates"."content" from "exercise_element_templates" inner join "latest_exercise_element_template_version_numbers" on ("exercise_element_templates"."entityId" = "latest_exercise_element_template_version_numbers"."entityId" and "exercise_element_templates"."version" = "latestversion"));--> statement-breakpoint
