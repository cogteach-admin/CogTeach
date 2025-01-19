import SyncProcedure from "./syncProcModules/syncProcedure.js";
import controllerFactory from "./syncProcModules/controller.js";
import visualizerFactory from "./syncProcModules/visualizer.js";

class StudentSyncProcedure extends SyncProcedure {
    constructor(dataManager, controller, visualizerList) {
        super(controller, visualizerList);

        this.dataManager = dataManager;
    }

    init() {
        this.visualizers.forEach(visualizer => {
            visualizer.init()
        });
    }

    end() {
        clearInterval(this.syncID);
        this.visualizers.forEach(visualizer => {
            visualizer.end()
        });
    }

    sync() {
        this.syncID = setInterval(async () => {
            this.secondCounter++;

            if (this.secondCounter % updateInterval !== 0) {
                this.dataManager.notifySubscribers().catch(err => console.error(err));
            } else {
                this.dataManager.notifySubscribers().then(() => {
                    console.log(`[#${this.secondCounter / updateInterval} update - ${Math.floor(this.secondCounter / 60)} min ${this.secondCounter % 60} sec]`)
                    return this.post(
                        // '/gazeData/sync', this.dataManager.data, STUDENT
                        // '/gazeData/teacher', this.dataManager.data, STUDENT
                        '/service/workshop', this.dataManager.data, STUDENT, this.secondCounter / updateInterval
                    )
                }).then((res) => {
                    if (res.slide_id) {
                        this.visualize(res);
                        // update slideId if changed
                        if (slideId !== res.slide_id) {
                            slideId = res.slide_id;
                        }
                    } else {
                        // console.log(res)
                    }
                }).catch(err => {
                    // clearInterval(this.syncID);
                    console.error(err.name + ": " + err.message);
                });
            }
        }, inferInterval);
    }
}

/**
 * Factory function that provides the student sync proc manager according to the trial setting.
 * @param {Object} settings - Trial setting.
 * @param {Object} configurations - Configurations of the visualizers.
 * @param confusionReporter - The DataGenerator that sets up event handlers for interactive AoI.
 * @param mouseEventListener - The DataGenerator that is responsible to tracking mouse clicks in DataManager.
 * @param {DataManager} dataManager - Managing data provided by DataGenerators.
 * @returns {StudentSyncProcedure|SyncProcedure}
 */
export default function syncProcedureFactory(settings, configurations, confusionReporter, mouseEventListener, dataManager) {
    let {shareGazeInfo, shareCogInfo, visualizerNames} = settings;

    if (!(shareGazeInfo && shareCogInfo)) return new SyncProcedure();

    let controller = controllerFactory(visualizerNames),
        visualizerList = visualizerFactory(visualizerNames, configurations, confusionReporter, mouseEventListener);

    return new StudentSyncProcedure(dataManager, controller, visualizerList);
}