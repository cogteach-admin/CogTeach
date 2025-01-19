export default class TeacherProcedure {
    constructor(screenCapturer, syncProcedure) {
        this.screenCapturer = screenCapturer;
        this.syncProcedure = syncProcedure;
    }

    init() {
        // Initialize DOM elements
        // Other internal states are initialized in constructors
        this.screenCapturer.init();
        this.syncProcedure.init();
    }

    calibrateScreenCapturer() {
        this.screenCapturer.calibrate();
    }

    joinZoom() {
    }

    sync() {
        this.screenCapturer.start();
        this.syncProcedure.sync();
    }

    end() {
        this.screenCapturer.end();
        this.syncProcedure.end();
    }
}