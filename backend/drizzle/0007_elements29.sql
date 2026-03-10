CREATE TABLE "collection_dependency_mapping" (
	"collectionEntityId" varchar NOT NULL,
	"collectionVersionId" varchar NOT NULL,
	"dependentCollectionEntityId" varchar NOT NULL,
	"dependentCollectionVersionId" varchar NOT NULL,
	CONSTRAINT "unique_collection_dependency" UNIQUE("collectionVersionId","dependentCollectionVersionId"),
	CONSTRAINT "unique_collection_dependency_2" UNIQUE("collectionVersionId","dependentCollectionEntityId")
);
--> statement-breakpoint
ALTER TABLE "collection_dependency_mapping" ADD CONSTRAINT "collection_dependency_mapping_collectionVersionId_exercise_element_sets_versionId_fk" FOREIGN KEY ("collectionVersionId") REFERENCES "public"."exercise_element_sets"("versionId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_dependency_mapping" ADD CONSTRAINT "collection_dependency_mapping_dependentCollectionVersionId_exercise_element_sets_versionId_fk" FOREIGN KEY ("dependentCollectionVersionId") REFERENCES "public"."exercise_element_sets"("versionId") ON DELETE cascade ON UPDATE no action;