/**
 * @typedef VelocityThresholds
 * @type {number[]}
 */

/**
 * To be compatible with existing global variable math and jest unit test.
 * @type {math.MathJsStatic|math|undefined}
 */
import OneEuroFilter from "./modules/OneEuroFilter.js"
const freqhz = 120, mincutoff = 0.3, beta = 0.3;
const euroFilterX = new OneEuroFilter(freqhz, mincutoff, beta),
    euroFilterY = new OneEuroFilter(freqhz, mincutoff, beta);

const euroFilter = (filter, values, timestamps) => values.map((v, i) => filter(v, timestamps[i]/1000))

let mathEngine = (typeof math === 'object') ? math : undefined;

export function setMathEngine(me) {
    mathEngine = me;
}

/**
 * Detect fixations and saccades from a stream of eye positions recorded by an eye-tracker.
 *
 * The detection is done using an algorithm for saccade detection proposed by Ralf Engbert and Reinhold Kliegl.
 * Anything that happens between two saccades is considered to be a fixation.
 *
 * @see Ralf Engbert, Reinhold Kliegl: Microsaccades uncover the orientation of covert attention, Vision Research, 2003.
 */
export default class EKThresholdDetector {
    constructor() {
        this.ptr = 0; // for faster array element replace
        this.vxBuffer = [];
        this.vyBuffer = [];
    }

    /**
     * Calculate the velocity threshold to be transmitted to the server.
     * @param {Object} samples - Containing timestamp, x coordinates and y coordinates.
     * @param {number[]} samples.x - x coordinates.
     * @param {number[]} samples.y - y coordinates.
     * @param {number[]} samples.t - Timestamps.
     * @param {number} buf_size - Determines the size of buffer. The buffer holds velocity to decide the threshold.
     * @param {number} lambda - Determine the value of threshold. A larger lam lead to a higher threshold, and applies to a more noisy case.
     * @param {boolean} smooth_coordinates - Whether to smooth raw gaze data.
     * @param {string} smooth_type - The smooth filter used in smooth_coordinates. Possible values are:
     *  1). "median" uses the median filter and 2). 2. "mean" uses the mean filter. 3). "euro" uses the 1-euro filter.
     * @param {number} window - Length of the filter used to smooth gaze data.
     * @returns {VelocityThresholds} - An array containing vx_threshold and vy_threshold
     */
    getVelocityThreshold(samples, {
        buf_size = 20,
        lambda = 3,
        smooth_coordinates = false,
        smooth_type = "median",
        window = 3
    } = {}) {
        this.buf_size = buf_size;
        this.lambda = lambda;
        this.smooth_coordinates = smooth_coordinates;
        this.smooth_type = smooth_type;
        this.window = window;

        if (samples.x.length === 0) {
            console.warn("No valid gaze samples. Will pass threshold calculating.");
            return([0, 0]);
        } else if (samples.x.length < window) {
            console.warn(`Valid gaze samples are too small (${samples.x.length}). Will pass threshold calculating.`);
            return([0, 0]);
        }

        this._sample2matrix(samples);

        if (smooth_coordinates) {
            switch (smooth_type) {
                case "median":
                    samples.x = this._median_filter(samples.x, this.window);
                    samples.y = this._median_filter(samples.y, this.window);
                    break
                case "mean":
                    samples.x = kernel(samples.x, mathEngine.multiply(1 / window, mathEngine.ones(window)));
                    samples.y = kernel(samples.y, mathEngine.multiply(1 / window, mathEngine.ones(window)));
                    break
                case "euro":
                    samples.x = euroFilter(euroFilterX, samples.x, samples.t);
                    samples.y = euroFilter(euroFilterY, samples.y, samples.t);
                default:
                    throw new Error(`Invalid smooth_type for smooth_coordinates. Should be "mean", "median", or "euro". Got ${smooth_type}.`);
            }

        }

        return this._calculateThreshold(samples, lambda);
    }

    /**
     * Convert input array to math.matrix
     * @param {Object} samples - Containing timestamp, x coordinates and y coordinates.
     * @param {number[]} samples.x - x coordinates.
     * @param {number[]} samples.y - y coordinates.
     * @param {number[]} samples.t - Timestamps.
     * @private
     */
    _sample2matrix(samples) {
        samples.x = mathEngine.matrix(samples.x);
        samples.y = mathEngine.matrix(samples.y);
        samples.t = mathEngine.matrix(samples.t);
    }

    /**
     * Calculate the velocity threshold for x-axis and y-axis.
     * @param {Object} samples - Containing timestamp, x coordinates and y coordinates.
     * @param {number} lambda - Determine the value of threshold. A larger lam lead to a higher threshold, and applies to a more noisy case.
     * @returns {number[]} An array with two elements, vx_threshold and vy_threshold.
     * @private
     */
    _calculateThreshold(samples, lambda) {
        let dx = this._kernel(samples.x, mathEngine.matrix([-1, 0, 1]), 'result');
        let dy = this._kernel(samples.y, mathEngine.matrix([-1, 0, 1]), 'result');
        let dt = this._kernel(samples.t, mathEngine.matrix([-1, 0, 1]), 'result');

        let vx = mathEngine.dotDivide(dx, dt);
        let vy = mathEngine.dotDivide(dy, dt);

        // Update history buffer to compute more accurate threshold
        if (this.ptr < 20) {
            this.vxBuffer.push(vx);
            this.vyBuffer.push(vy);
        } else {
            this.vxBuffer[this.ptr % this.buf_size] = vx;
            this.vyBuffer[this.ptr % this.buf_size] = vy;
        }
        this.ptr++;
        // in case of ptr overflow...
        if (this.ptr > 200 * this.buf_size) this.ptr = this.buf_size + this.ptr % this.buf_size;
        let all_vx = mathEngine.concat(...this.vxBuffer);
        let all_vy = mathEngine.concat(...this.vyBuffer);

        let median_vx2 = mathEngine.median(this._pow2(all_vx));
        let medianvx_2 = mathEngine.pow(mathEngine.median(all_vx), 2);
        let msdx = mathEngine.sqrt(median_vx2 - medianvx_2);

        let median_vy2 = mathEngine.median(this._pow2(all_vy));
        let medianvy_2 = mathEngine.pow(mathEngine.median(all_vy), 2);
        let msdy = mathEngine.sqrt(median_vy2 - medianvy_2);

        let radiusx = mathEngine.multiply(lambda, msdx);
        let radiusy = mathEngine.multiply(lambda, msdy);

        return [radiusx, radiusy]
    }

    /**
     * Self-inplementation of convolution, while the second array is not inverted.
     * @param vector - One dimensional math.matrix.
     * @param kernel - One dimensional math.matrix. Usually a filter.
     * @param {string} padMode - Decides how the convolution result is padded. Accepts:
     * - "none" for no padding;
     * - "original" for using the edge elements of the input to pad
     * - "result" for using the edge elements of the convolution result to pad
     * @returns One dimensional math.matrix.
     * @private
     */
    _kernel(vector, kernel, padMode = 'original') {
        if (!["none", "original", "result"].includes(padMode)) {
            throw new Error('Invalid padding mode in function kernel()! Valid inputs: original, result, or none.');
        }

        let kernelSize = mathEngine.squeeze(kernel.size());
        let sampleSize = mathEngine.squeeze(vector.size());

        // reverse kernel (!there is no need to reverse the kernel!)
        // kernel = kernel.subset(mathEngine.index(mathEngine.range(kernelSize - 1, -1, -1)));

        let convMatrix = mathEngine.zeros(sampleSize - kernelSize + 1, sampleSize);
        mathEngine.range(0, convMatrix.size()[0]).forEach(row => {
            convMatrix.subset(mathEngine.index(row, mathEngine.add(mathEngine.range(0, kernelSize), row)), kernel);
        });

        let result = mathEngine.multiply(convMatrix, vector);
        switch (padMode) {
            case 'none':
                // Do not pad
                return result;
            case 'original':
                // use original value to fill empty
                return mathEngine.concat([vector.get([0])],
                    result,
                    [vector.get([sampleSize - 1])], 0);
            case 'result':
                // use computed result to fill empty
                return mathEngine.concat([result.get([0])],
                    result,
                    [result.get([sampleSize - kernelSize])], 0);
            default:
                break;
        }
    }

    /**
     * Element-wise power of 2.
     * @param vector - One dimensional math.matrix.
     * @returns A vector to its element-wise power of 2.
     * @private
     */
    _pow2(vector) {
        return mathEngine.dotMultiply(vector, vector)
    }

    /**
     * Implement a median filter. Edge elemetns are padded with original elements.
     * @param vector - A math.matrix of size N x 1.
     * @param {number} window - The size of thw filter window.
     * @returns The filtered result.
     * @private
     */
    _median_filter(vector, window) {
        const vector_len = mathEngine.squeeze(vector.size()),
            pad_length = Math.floor(window / 2),
            pre = mathEngine.multiply(vector.get([0]), mathEngine.ones(pad_length)),
            post = mathEngine.multiply(
                vector.get([vector_len - 1]),
                mathEngine.ones(pad_length)
            ),
            padded_row = mathEngine.concat(pre, vector, post);
        let mat = [];
        for (let i = 0; i < vector_len; i++) {
            mat.push(mathEngine.median(
                padded_row.subset(mathEngine.index(
                    mathEngine.range(i, i + window)
                ))))
        }
        return mathEngine.matrix(mat)
    }
}