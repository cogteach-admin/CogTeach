// =============================================
// Sync procedure - Controller
// =============================================

/**
 * @typedef MinimizedAoI
 * @type {object}
 * @property {number[]} upper_left_point - The x, y coordinate of the upper left point.
 * @property {number[]} lower_right_point - The x, y coordinate of the lower right point.
 * @property {number} status - The confusion status. Defined as confusion_count in AoI / student_count in AoI.
 * @property {number} percentage - The student percentage. Defined as fixation_count in AoI / total_fixation_count.
 */

/**
 * @typedef StudentResponse
 * @type {object}
 * @property {string} stuNum - The sequential number of slide screenshot.
 * @property {number} slide_id - The id of slide.
 * @property {MinimizedAoI[]} aois - A list of AoIs. Each AoI is an instance of the AoI class defined in gaze/gaze_classes.py.
 * @property {number} slide_aspect_ratio - The aspect ratio of the screenshot.
 * @property {number} confusion_ratio - The ratio of # confusion students / # students.
 * @property {number} inattention_ratio - The ratio of # inattentive students / # students.
 */

/**
 * @typedef TeacherResponse
 * @type {object}
 */

/**
 * Prepare the responses ready for AoI visualization.
 * @param {StudentResponse|TeacherResponse|any} res
 * @return An array of {@link SaliencyAoI}, and a N-by-N array, where N is the number of AoIs.
 */
function prepareAoIs(res) {
    // Before second refactor
    // if (res.fixations.length === 0) {
    //     console.warn('No fixation is received from server.');
    //     return [[], []]
    // }
    //
    // res.fixations = res.fixations.map(fixation => Fixation.fromFixationData(fixation));
    // let [AoIs, TMatrix] = AoIBuilder(res.fixations, res.saccades, res.result);
    //
    // return [AoIs, TMatrix]

    // const maxH = document.documentElement.clientHeight,
    //     maxW = document.documentElement.clientWidth,
    //     yOffset = 0 //document.getElementById("container").getBoundingClientRect().y;

    let containerBoundingRect;

    if (_jitsi) {
        containerBoundingRect = _jitsi.getIFrame().getBoundingClientRect();
    } else {
        containerBoundingRect = document.getElementById("container").getBoundingClientRect();
    }

    const largeVideoPosition = calculateLargeVideoPosition(res.slide_aspect_ratio,  containerBoundingRect);
    const maxH = largeVideoPosition.height,
        maxW = largeVideoPosition.width,
        yOffset = largeVideoPosition.top - document.getElementById("container").getBoundingClientRect().top,
        xOffset = largeVideoPosition.left;

    let AoIs = [],
        TMatrix = new Array(res.aois.length).fill(
            new Array(res.aois.length).fill(0)
        );

    for (const [aoiId, aoi] of res.aois.entries()) {
        let recovered_upper_left_point = aoi.upper_left_point,
            recovered_lower_right_point = aoi.lower_right_point;

        recovered_upper_left_point[0] *= maxW;
        recovered_upper_left_point[1] *= maxH;
        recovered_lower_right_point[0] *= maxW;
        recovered_lower_right_point[1] *= maxH;

        // Compensate for the UI offset.
        recovered_upper_left_point[0] += xOffset;
        recovered_lower_right_point[0] += xOffset;
        recovered_upper_left_point[1] += yOffset;
        recovered_lower_right_point[1] += yOffset;

        AoIs.push(new SaliencyAoI(
            res.slide_id, aoiId,
            recovered_upper_left_point, recovered_lower_right_point,
            aoi.status, aoi.percentage
        ))
    }

    return [AoIs, TMatrix]
}

/**
 * Prepare the responses ready for cog-bar visualization.
 * @param {StudentResponse|TeacherResponse|any} res
 * @return {number[]} - [confusionRatio, inattentionRatio]
 */
function prepareCogRatio(res) {
    // Before second refactor
    // let confusionRate= 0,
    //     inattentionRate = 0,
    //     total = res.cognitives.length
    //
    // if (total === 0) {
    //     // Otherwise Number/0 will lead to NaN and hence no bar chart viz
    //     console.warn('No cognitive information is received from server.');
    //     return [confusionRate, inattentionRate]
    // }
    //
    // res.cognitives.forEach((cogInfo) => {
    //     // shareCogInfo {stuNum: number, confusion: string[], inattention: number}
    //     if (cogInfo.inattention > 0) ++inattentionRate;
    //     if (cogInfo.confusion.some((state) => state === 'Confused')) ++confusionRate;
    // })
    //
    // confusionRate = confusionRate / total;
    // inattentionRate = inattentionRate / total;
    //
    // return [confusionRate, inattentionRate]
    return [res.confusion_ratio, res.inattention_ratio]
}

/**
 * Calculate the position information of the largeVideo of Jitsi with screenshot and iframe position info.
 * @param aspect_ratio The shape information of the screenshot. r = w / h
 * @param iframePosition The position information of the iframe.
 * @returns An object with information on`top`, `left`, `height`, and `width` of the largeVideo.
 */
function calculateLargeVideoPosition(aspect_ratio, iframePosition) {
    const iframe_ratio = iframePosition.width / iframePosition.height,
        top = iframePosition.top;
    let xOffset = 0,
        yOffset = 0;
    if (aspect_ratio > iframe_ratio) {
        // width will be satisfied, margins on the top and bottom.
        let new_h = iframePosition.width / aspect_ratio;
        yOffset = Math.round((iframePosition.height - new_h) / 2)
    } else {
        // height will be satisfied, margins on the left and right
        let new_w = iframePosition.height * aspect_ratio;
        xOffset = Math.round((iframePosition.width - new_w) / 2);
    }

    return {
        top: top + yOffset,
        left: xOffset,
        height: iframePosition.height - 2 * yOffset,
        width: iframePosition.width - 2 * xOffset,
    }
}

/**
 * Factory function that provides the controller (data processor) according to specified visualizers.
 * @param {string[]} visualizers - See {@link visualizerNames}.
 * @returns {(function(*): {ratioList: [number,number]|[number,number], TMatrix: *, AoIList: *})|(function(*): {TMatrix: *, AoIList: *})|(function(*): {ratioList: [number,number]|[number,number]})}
 */
export default function controllerFactory(visualizers) {
    let controller;

    const containsAoI = visualizers.some(name => name.indexOf("aoi") >= 0), // including aoi and interactive aoi
        containsCogBar = visualizers.some(name => name.indexOf("cogbar") >= 0);

    if (containsAoI) {
        if (containsCogBar) {
            // Both on
            controller = (res) => {
                let [AoIList, TMatrix] = prepareAoIs(res);
                let ratioList = prepareCogRatio(res);
                return {AoIList, TMatrix, ratioList}
            }
        } else {
            // Only aoi is on
            controller = (res) => {
                let [AoIList, TMatrix] = prepareAoIs(res);
                return {AoIList, TMatrix}
            }
        }
    } else {
        if (containsCogBar) {
            // Only cogbar is on
            controller = (res) => {
                let ratioList = prepareCogRatio(res);
                return {ratioList}
            }
        } else {
            // Nothing is on
            controller = () => {
            }
        }
    }

    return controller
}