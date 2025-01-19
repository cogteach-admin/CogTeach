// Ralf Engbert, Reinhold Kliegl: Microsaccades uncover the
// orientation of covert attention, Vision Research, 2003.

// Functions for the detection of fixations in raw eye-tracking data.
//
// Offers a function for detecting fixations in a stream of eye
// positions recorded by an eye-tracker.  The detection is done using
// an algorithm for saccade detection proposed by Ralf Engbert and
// Reinhold Kliegl (see reference below).  Anything that happens
// between two saccades is considered to be a fixation.  This software
// is therefore not suited for data sets with smooth-pursuit eye
// movements.

// @param samples a data frame containing the raw samples as recorded
// by the eye-tracker.  This data frame has four columns:
// \describe{
//  \item{time:}{the time at which the sample was recorded}
//  \item{trial:}{the trial to which the sample belongs}
//  \item{x:}{the x-coordinate of the sample}
//  \item{y:}{the y-coordinate of the sample}
// }
// Samples have to be listed in chronological order.  The velocity
// calculations assume that the sampling frequency is constant.
// @param lambda a parameter for tuning the saccade
// detection.  It specifies which multiple of the standard deviation
// of the velocity distribution should be used as the detection
// threshold.
// @param smooth.coordinates logical. If true the x- and y-coordinates will be
// smoothed using a moving average with window size 3 prior to saccade
// detection.
// @param smooth.saccades logical.  If true, consecutive saccades that
// are separated only by a few samples will be joined.  This avoids
// the situation where swing-backs at the end of longer saccades are
// recognized as separate saccades.  Whether this works well, depends
// to some degree on the sampling rate of the eye-tracker.  If the
// sampling rate is very high, the gaps between the main saccade and
// the swing-back might become too large and look like genuine
// fixations.  Likewise, if the sampling frequency is very low,
// genuine fixations may be regarded as spurious.  Both cases are
// unlikely to occur with current eye-trackers.

class EKDetector{
    constructor(buf_size, lambda, smooth_coordinates, smooth_saccades) {
        this.buf_size = buf_size ? buf_size : 20; // decides the size of vxBuffer/vyBuffer
        this.lambda = lambda ? lambda : 3;
        this.smooth_coordinates = smooth_coordinates ? smooth_coordinates : false;
        this.smooth_saccades = smooth_saccades ? smooth_saccades : true;

        this.ptr = 0; // for faster array element replace
        this.vxBuffer = [];
        this.vyBuffer = [];
    }

    detect(samples) {
        return this.detectFixations(samples, this.lambda, this.smooth_coordinates, this.smooth_saccades);
    }

    detectFixations(samples, lambda=6, smooth_coordinates=false, smooth_saccades=true) {
        this.sample2matrix(samples);

        if (smooth_coordinates) {
            samples.x = kernel(samples.x, math.multiply(1/3, math.ones(3)));
            samples.y = kernel(samples.y, math.multiply(1/3, math.ones(3)));
        }

        samples= this.detectSaccades(samples, lambda, smooth_saccades);

        let [fixations, saccades] = this.aggregateFixations(samples);

        this.removeArtifacts(fixations);

        return [fixations, saccades];
    }

    sample2matrix(samples) {
        samples.x = math.matrix(samples.x);
        samples.y = math.matrix(samples.y);
        samples.t = math.matrix(samples.t);
    }

    detectSaccades(samples, lambda, smooth_saccades){
        let dx = kernel(samples.x, math.matrix([-1, 0, 1]), 'result');
        let dy = kernel(samples.y, math.matrix([-1, 0, 1]), 'result');
        let dt = kernel(samples.t, math.matrix([-1, 0, 1]), 'result');

        let vx = math.dotDivide(dx, dt);
        let vy = math.dotDivide(dy, dt);

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
        if (this.ptr > 200*this.buf_size) this.ptr = this.buf_size + this.ptr % this.buf_size;
        let all_vx = math.concat(...this.vxBuffer);
        let all_vy = math.concat(...this.vyBuffer);

        let median_vx2 = math.median(pow2(all_vx));
        let medianvx_2 = math.pow(math.median(all_vx), 2);
        let msdx = math.sqrt(median_vx2 - medianvx_2);

        let median_vy2 = math.median(pow2(all_vy));
        let medianvy_2 = math.pow(math.median(all_vy), 2);
        let msdy = math.sqrt(median_vy2 - medianvy_2);

        let radiusx = math.multiply(lambda, msdx);
        let radiusy = math.multiply(lambda, msdy);

        let sacc = math.larger(
            math.add(pow2(math.divide(vx, radiusx)), pow2(math.divide(vy, radiusy))),
            1);
        if (smooth_saccades) {
            sacc = kernel(sacc, math.multiply(1/3, math.ones(3)));
            sacc = math.larger(sacc, 0.5);
        }

        samples.saccade = sacc;
        samples.vx = vx;
        samples.vy = vy;

        return samples;
    }

    aggregateFixations(samples) {
        let fixations = [];
        let saccades = [];
        if (samples.saccade._data.every(indicator => indicator === false)) {
            // all fixation
            fixations.push(new Fixation(
                samples.x,
                samples.y,
                samples.t.get([0]),
                samples.t.get([samples.saccade.size()[0]]))
            );
            return [fixations, saccades];
        } else if (samples.saccade._data.every(indicator => indicator === true)) {
            // all saccade
            saccades.push(new Saccade(
                samples.x,
                samples.y,
                samples.vx,
                samples.vy
            ));
            return [fixations, saccades];
        }

        let idx = math.range(0, samples.saccade.size()[0]);

        let sacc_event = math.concat([0], math.diff(samples.saccade));
        // In sacc_event a 1 marks the start of a saccade and a -1 the
        // start of a fixation.

        let minusOnes = math.filter(idx, (i)=>{
            return math.equal(sacc_event.get([i]),-1);
        }); // start of sacc, end of fixation
        let plusOnes = math.filter(idx, (i)=>{
            return math.equal(sacc_event.get([i]),1);
        }); // start of fixation, end of sacc

        // Generate Saccades
        let begin = plusOnes;
        let end = minusOnes;
        if (end.get([0]) < begin.get([0])){
            // happens when the gaze starts directly from a fixation, end before start
            begin = math.concat([0], begin);
        }
        if (begin.get([ begin.size()[0]-1 ]) > end.get([ end.size()[0]-1 ])) { // happens when the gaze ends with a fixation, begin after end
            end = math.concat(end, [math.subtract(samples.saccade.size()[0], 1)]);
        }

        begin.forEach((element, i) => {
            let slice = math.index(math.range(element,end.get(i)+1));
            saccades.push(new Saccade(
                samples.x.subset(slice),
                samples.y.subset(slice),
                samples.vx.subset(slice),
                samples.vy.subset(slice))
            );
        })

        // Generate Fixations, special cases
        begin = minusOnes;
        end = plusOnes;
        if (end.get([0]) < begin.get([0])){
            // happens when the gaze starts directly from a fixation, end before start
            begin = math.concat([0], begin);
        }
        if (begin.get([ begin.size()[0]-1 ]) > end.get([ end.size()[0]-1 ])) { // happens when the gaze ends with a fixation, begin after end
            end = math.concat(end, [math.subtract(samples.saccade.size()[0], 1)]);
        }

        // Generate Fixations
        begin.forEach((element, i) => {
            let slice = math.index(math.range(element,end.get(i)+1));
            fixations.push(new Fixation(
                samples.x.subset(slice),
                samples.y.subset(slice),
                samples.t.get([element]),
                samples.t.get([end.get(i)]))
            );
        });

        return [fixations, saccades];
    }

    // Experimental: This function tries to detect blinks and artifacts
    // based on x- and y-dispersion and duration of fixations.
    removeArtifacts(fixations){
        // not implemented yet... might cost a lot

        // fixations.forEach((fixation)=>{
        //     let lsdx = math.log10(fixation.madx);
        //     let lsdy = math.log10(fixation.mady);

        // })
    }
}

function kernel(samples, kernel, padMode='original') {
    let kernelSize = math.squeeze(kernel.size());
    let sampleSize = math.squeeze(samples.size());

    let convMatrix = math.zeros(sampleSize-kernelSize+1, sampleSize);
    math.range(0,convMatrix.size()[0]).forEach( row => {
        convMatrix.subset(math.index(row, math.add(math.range(0,kernelSize), row)), kernel);
    });

    let result = math.multiply(convMatrix, samples);
    switch (padMode) {
        case 'none':
            // Do not pad
            return result;
        case 'original':
            // use original value to fill empty
            return math.concat([samples.get([0])],
                result,
                [samples.get([sampleSize-1])], 0);
        case 'result':
            // use computed result to fill empty
            return math.concat([result.get([0])],
                result,
                [result.get([sampleSize-kernelSize])], 0);
        default:
            throw new Error('Wrong padding mode in function kernel()! Either original or result.');
    }
}


function pow2(vector){
    return math.dotMultiply(vector, vector)
}