import DataGenerator from "./DataGenerator.js";

/**
 * The class that handles reporting inattention from visibility change.
 * Please check {@link GazeEstimator} and {@link StudentDataManager} for inattention detection from face lost.
 * @constructor
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class InattentionReporter extends DataGenerator {
    constructor(dataManager) {
        super();

        this.dataManager = dataManager;

        this.lastHiddenTimestamp = 0;
        this.hiddenReported = false;
    }

    start() {
        document.addEventListener('visibilitychange', this.reportInattention.bind(this));
    }

    end() {
        document.removeEventListener('visibilitychange', this.reportInattention.bind(this));
    }

    reset() {
        this.lastHiddenTimestamp = 0;
        this.hiddenReported = false;
    }

    /**
     * Notify users when they are not paying attention.
     * This is done by adding event handler to visibilitychange.
     * When the tab is switched or the browser is minimized, visibilitychange event will emit.
     */
    reportInattention() {
        if (document.visibilityState === 'hidden') {
            this.lastHiddenTimestamp = new Date().getTime();
            setTimeout(() => {
                if (this.lastHiddenTimestamp !== 0 && !this.hiddenReported) {
                    this.hiddenReported = true; // To prevent duplicated alert
                    // otherwise each time "hidden" -> "visible" -> "hidden" within 5 seconds
                    // a new setTImeout is triggered. Each triggered function will play the video once.
                    // new Audio('/media/audio/alert.mp3').play().catch(err => console.log(err));
                }
            }, updateInterval * inferInterval)
        } else if (document.visibilityState === 'visible') {
            // Student returns.
            // Remove alert by clean lastHiddenTimestamp
            this.reset();
        }
    }

    /**
     * The dataManager periodically notifies inattention reporter to see whether the page is still not visible.
     * If so, the dataManager will increase the count of inattention (sync experiment) or add a phrase (async experiment).
     * @returns {Promise<void>}
     */
    async generateData() {
        if (document.visibilityState === 'hidden') {
            if (this.dataManager.incInattentionCount) {
                this.dataManager.incInattentionCount();
            } else {
                this.dataManager.addInattention("visibility-hidden")
            }
        }
    }
}

export default function inattentionReporterFactory(dataManager) {
    return new InattentionReporter(dataManager)
}
