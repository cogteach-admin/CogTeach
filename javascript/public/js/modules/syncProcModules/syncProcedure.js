// =============================================
// Sync procedure (Abstract classes)
// =============================================

/**
 * Abstract class for the synchronization procedure manager.
 * @abstract
 * @constructor
 * @param {function} controllers - The data processor that processes the response from the server.
 * @param {string[]} visualizerList - The name list of visualizers to be used.
 */
export default class SyncProcedure {
    constructor(controller, visualizerList) {
        this.secondCounter = 0;

        this.controller = controller;
        this.visualizers = visualizerList;
    }

    // Public entry
    init() {
    }

    sync() {
    }

    end() {
    }

    // Used by both StudentSyncProcedure and TeacherSyncProcedure
    // Post request to endpoint
    /**
     * For students, structure of the request body should meet:
     * - `stuNum`: The student number.
     * - `gaze_samples`: The gaze points. A dictionary containing fields: x, y, timestamp.
     * - `thresholds`: The velocity thresholds. A tuple (threshold_x, threshold_y)
     * - `confusion`: A list of dictionaries with fields:
     *  1. `timestamp`: The timestamp when the confusion is reported.
     *  2. `slide_id`: The id of the slide when confusion is reported.
     *  3. `aoi_id`: The id of the AoI when confusion is reported.
     * - `inattention`: The number of detected inattention.
     * - `timestamp`: The timestamp when the request is made.
     * - `role`: STUDENT (1) or TEACHER (2).
     *
     * For instructors, structure of the request body should meet:
     * - `slide_id`: The sequential number of slide screenshot.
     * - `screemshot`: The screenshot itself. Encoded in base64.
     * - `timestamp`: The timestamp when the request is made.
     * - `role`: STUDENT (1) or TEACHER (2).
     *
     * @param endpoint - The server endpoint. /service/cluster (STUDENT) or /service/saliency (TEACHER).
     * @param data - data to be posted to the server.
     * @param role - STUDENT (1) or TEACHER (2).
     * @param updateCounter the seq number of uploaded information
     * @return {Promise<any>}
     */
    async post(endpoint, data, role, updateCounter = 0) {
        let headers = {'Content-Type': 'application/json'},
            body = JSON.stringify({...data, timestamp: Date.now(), role: role, updateCounter: updateCounter});

        console.debug(data);
        let res = await fetch(endpoint,
            {method: 'POST', body, headers}
        );

        return res.json();
    }

    // Implemented by both StudentSyncProcedure and TeacherSyncProcedure
    // Visualize information
    /**
     * Visualize the response from the server.
     * @param res - Response from the server.
     */
    visualize(res) {
        let results = this.controller(res);
        console.debug(results);
        if (results) {
            this.visualizers.forEach(visualizer => {
                visualizer.visualize(results)
            });
        }
    }
}