export default class StudentProcedure {
    constructor(gazeEstimator, expressionCollector, inattentionReporter, mouseEventListener, syncProcedure) {
        this.gazeEstimator = gazeEstimator;
        this.expressionCollector = expressionCollector;
        this.inattentionReporter = inattentionReporter;
        this.mouseEventListener = mouseEventListener;
        this.syncProcedure = syncProcedure;
    }

    init() {
        // Initialize DOM elements
        // Other internal states are initialized in constructors
        this.gazeEstimator.init();
        this.expressionCollector.init();
        this.syncProcedure.init();
    }

    /**
     * Calibrate for the gaze estimator.
     * @param onConfirmCallback The callback to be triggered when use clicked to start calibrate.
     */
    calibrateGazeEstimator(onConfirmCallback = () => {}) {
        this.gazeEstimator.calibrate(onConfirmCallback);
    }

    calibrateExpCollector(fastmode) {
        this.expressionCollector.calibrate(fastmode);
    }

    joinZoom() {
    }

    sync() {
        this.gazeEstimator.start();
        this.expressionCollector.start();
        this.inattentionReporter.start();
        this.mouseEventListener.start();
        this.syncProcedure.sync();
    }

    end() {
        this.gazeEstimator.end();
        this.expressionCollector.end();
        this.inattentionReporter.end();
        this.mouseEventListener.end();
        this.syncProcedure.end();
    }
}