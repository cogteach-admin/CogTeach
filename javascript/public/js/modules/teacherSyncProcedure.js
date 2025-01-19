import SyncProcedure from "./syncProcModules/syncProcedure.js";
import controllerFactory from "./syncProcModules/controller.js";
import visualizerFactory from "./syncProcModules/visualizer.js";

class TeacherSyncProcedure extends SyncProcedure {
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
    }

    sync() {
        this.syncID = setInterval(async () => {
            this.secondCounter++;

            await this.dataManager.notifySubscribers();

            if (this.secondCounter % updateInterval !== 0) return
            console.log(`[#${this.secondCounter/updateInterval} update - ${Math.floor(this.secondCounter/60)} min ${this.secondCounter%60} sec]`)

            console.log(this.dataManager.data)
            this.post(
                // 'gazeData/teacher',
                '/service/saliency',
                {...this.dataManager.data, stuNum: userInfo['number'],},
                TEACHER
            ).then((res) => {
                //TODO: Implement viz on instructor's side as well.
                // this.visualize(res);
                console.log(res.message);
            }).catch(err => {
                // clearInterval(this.syncID);
                console.error(err.name+": "+err.message);
            });
        }, inferInterval);
    }
}

/**
 * Factory function that provides the teacher sync proc manager according to the trial setting.
 * @param {Object} settings - Trial setting.
 * @param {Object} configurations - Configurations of the visualizers.
 * @param {DataManager} dataManager - Managing data provided by DataGenerators.
 * @returns {TeacherSyncProcedure|SyncProcedure}
 */
export default function syncProcedureFactory(settings, configurations, dataManager) {
    let {shareGazeInfo, shareCogInfo, visualizerNames} = settings;

    if (!(shareGazeInfo && shareCogInfo)) return new SyncProcedure();

    let controller = controllerFactory(visualizerNames),
        visualizerList = visualizerFactory(visualizerNames, configurations, undefined);

    return new TeacherSyncProcedure(dataManager, controller, visualizerList);
}