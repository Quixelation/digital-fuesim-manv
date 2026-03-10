import { createTestEnvironment } from '../../../test/utils.js';

describe('collections', () => {
    const environment = createTestEnvironment();
    it('can be created', async () => {
        const title = 'Test Collection';
        const owner = 'test-owner';

        await environment.collectionService.createExerciseSet(title, owner);

        const collections =
            await environment.collectionService.getLatestExerciseElementSetsForUser(
                owner
            );

        expect(collections).toHaveLength(1);
        expect(collections[0]?.title).toBe(title);
        expect(collections[0]?.owner).toBe(owner);
    });
});
