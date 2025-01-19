/**
 * DataGenerator is the Observer.
 * DataManager (defined in DataManager.js) is the Publisher.
 * (A little different to the pure Observer pattern.)
 *
 * SyncProcedure -> DataManager <-> DataGenerator (FacialExp, ScreenShot)
 *
 * gazeEstimators are not included, since they do not need to be triggered.
 * @abstract
 * @constructor
 */
export default class DataGenerator {
    constructor() {}

    /**
     * Add data to DataManagger. Abstract method must be implemented by subclasses.
     * @abstract
     * @async
     * @returns {Promise<void>}
     */
    async generateData() {
        throw new Error("DataGenerator generateData() method must be implemented.");
    }
}

