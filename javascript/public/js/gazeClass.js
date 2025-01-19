class Fixation{
    constructor(x_coords, y_coords, start, end){
        this.data = {};
        if (typeof(tf) !== "undefined") {
            // Toggle when use tensorflow.js to compute fixations and saccades
            // xall & yall are converted to percentage, ranging from [0, 100);
            if (x_coords instanceof Array) {
                // Reconstruct from server data, already percentage
                this.data.xall = x_coords;
                this.data.yall = y_coords;
            } else {
                // First time construction
                this.data.xall = x_coords.div(document.documentElement.clientWidth/100);
                this.data.yall = y_coords.div(document.documentElement.clientHeight/100);
            }

            this.data.x_per = tf.mean(this.data.xall).squeeze().dataSync()[0];
            this.data.xmax_per = tf.max(this.data.xall).squeeze().dataSync()[0];
            this.data.xmin_per = tf.min(this.data.xall).squeeze().dataSync()[0];
            this.data.xmad_per = get_median(this.data.xall.sub(get_median(this.data.xall))).dataSync()[0];
            this.data.xvar_per = tf.moments(this.data.xall).variance.sqrt().dataSync()[0];

            this.data.y_per = tf.mean(this.data.yall).squeeze().dataSync()[0];
            this.data.ymax_per = tf.max(this.data.yall).squeeze().dataSync()[0];
            this.data.ymin_per = tf.min(this.data.yall).squeeze().dataSync()[0];
            this.data.ymad_per = get_median(this.data.yall.sub(get_median(this.data.yall))).dataSync()[0];
            this.data.yvar_per = tf.moments(this.data.yall).variance.sqrt().dataSync()[0];

            if (!(x_coords instanceof Array)) {
                this.data.xall = this.data.xall.squeeze().dataSync()[0];
                this.data.yall = this.data.yall.squeeze().dataSync()[0];
            }

            this.data.start = start;
            this.data.end = end;
            this.data.duration = end.sub(start).dataSync()[0];
        } else {
            // Toggle when use math.js to compute fixations and saccades
            // xall & yall are converted to percentage, ranging from [0, 100);
            if (x_coords instanceof Array) {
                // Reconstruct from server data, already percentage
                this.data.xall = x_coords;
                this.data.yall = y_coords;
            } else {
                this.data.xall = math.divide(x_coords, document.documentElement.clientWidth/100).toArray();
                this.data.yall = math.divide(y_coords, document.documentElement.clientHeight/100).toArray();
            }

            this.data.x_per = math.mean(this.data.xall);
            this.data.xmad_per = math.mad(this.data.xall);
            this.data.xmax_per = math.max(this.data.xall);
            this.data.xmin_per = math.min(this.data.xall);

            this.data.y_per = math.mean(this.data.yall);
            this.data.ymad_per = math.mad(this.data.yall);
            this.data.ymax_per = math.max(this.data.yall);
            this.data.ymin_per = math.min(this.data.yall);

            this.data.start = start;
            this.data.end = end;
            this.data.duration = end - start;
        }

        // Bind confusion detection with fixation
        this.data.confusionCount = 0;
        this.data.stuNum = typeof userInfo === "undefined" ? undefined : userInfo['number'] ;
    }

    static fromFixationData(fixationData) {
        let fixation;
        if (typeof(tf) !== "undefined") {
            fixation = new this(tf.tensor1d(fixationData.xall), tf.tensor1d(fixationData.yall), fixationData.start, fixationData.end)
        } else {
            fixation = new this(fixationData.xall, fixationData.yall, fixationData.start, fixationData.end);
        }
        fixation.data.confusionCount = fixationData.confusionCount;
        fixation.data.stuNum = fixationData.stuNum;
        return fixation;
    }

    // Getters. Cater for visualization need. This is user-dependent.
    get x() {return this.data.x_per / 100 * document.documentElement.clientWidth}
    get xmax() {return this.data.xmax_per / 100 * document.documentElement.clientWidth}
    get xmin() {return this.data.xmin_per / 100 * document.documentElement.clientWidth}
    get xmad() {return this.data.xmad_per / 100 * document.documentElement.clientWidth}
    get y() {return this.data.y_per / 100 * document.documentElement.clientHeight}
    get ymax() {return this.data.ymax_per / 100 * document.documentElement.clientHeight}
    get ymin() {return this.data.ymin_per / 100 * document.documentElement.clientHeight}
    get ymad() {return this.data.ymad_per / 100 * document.documentElement.clientHeight}

    // Setters
    set x(val) {this.data.x_per = val * 100 / document.documentElement.clientWidth}
    set xmax(val) {this.data.xmax_per = val * 100 / document.documentElement.clientWidth}
    set xmin(val) {this.data.xmin_per = val * 100 / document.documentElement.clientWidth}
    set xmad(val) {this.data.xmad_per = val * 100 / document.documentElement.clientWidth}
    set y(val) {this.data.y_per = val * 100 / document.documentElement.clientHeight}
    set ymax(val) {this.data.ymax_per = val * 100 / document.documentElement.clientHeight}
    set ymin(val) {this.data.ymin_per = val * 100 / document.documentElement.clientHeight}
    set ymad(val) {this.data.ymad_per = val * 100 / document.documentElement.clientHeight}

    contain(timestamp) {
        return timestamp >= this.data.start && timestamp <= this.data.end;
    }

    incConfusionCount() {
        this.data.confusionCount++;
    }

    draw(ctx, r=10, color='#0B5345') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2, true);
        ctx.fill();
    }

    drawId(ctx, index, r=10, fontsize=16) {
        ctx.font = fontsize+'px serif';
        ctx.fillText(index, this.x+r, this.y+r);
        // ctx.fillText(this.xvar.print() + ', ' + this.yvar.print(), this.x + 2*r, this.y + r);
        // console.log(this.x);
        // console.log(this.y);
    }

    drawRectArea(ctx, color='#0B5345') {
        ctx.strokeStyle = color;
        ctx.strokeRect(this.xmin, this.ymin, this.xmax - this.xmin, this.ymax - this.ymin);
    }

}

class Saccade{
    constructor(x_coords, y_coords, vx, vy) {
        if (typeof(tf) !== "undefined") {
            // Toggle when use tensorflow.js to compute fixations and saccades
            // xall & yall are converted to percentage, ranging from [0, 100);
            this.xall = x_coords.div(document.documentElement.clientWidth/100).squeeze().arraySync();
            this.yall = y_coords.div(document.documentElement.clientHeight/100).squeeze().arraySync();
            this.vx = vx.div(document.documentElement.clientWidth/100).squeeze().arraySync();
            this.vy = vy.div(document.documentElement.clientHeight/100).squeeze().arraySync();
        } else {
            // Toggle when use math.js to compute fixations and saccades
            // xall & yall are converted to percentage, ranging from [0, 100);
            this.xall = math.divide(x_coords, document.documentElement.clientWidth/100);
            this.yall = math.divide(y_coords, document.documentElement.clientHeight/100);
            this.vx = math.divide(vx, document.documentElement.clientWidth/100);
            this.vy = math.divide(vy, document.documentElement.clientHeight/100);
        }
    }

    mark() {
        this.additional = true;
    } // To mark saccades before the first fixation or after the last fixation

    drawVelocity(ctx, arrowLen = 14, color = 'blue') {
        // color = '#'+Math.floor(Math.random()*16777215).toString(16);

        this.xall.forEach((fromX, i)=>{
            let fromY = this.yall[i];
            let offsetX = arrowLen * Math.cos(Math.atan2( this.vy[i], this.vx[i] ));
            let offsetY = arrowLen * Math.sin(Math.atan2( this.vy[i], this.vx[i] ));

            drawArrow(ctx, fromX, fromY, fromX+offsetX, fromY+offsetY, 30, 2, 3, color);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(fromX, fromY, 5, 0, Math.PI * 2, true);
            ctx.fill();
        });
    }
}

function drawArrow(ctx, fromX, fromY, toX, toY,theta,headlen,width,color) {
 
    theta = typeof(theta) != 'undefined' ? theta : 30;
    headlen = typeof(headlen) != 'undefined' ? headlen : 10;
    width = typeof(width) != 'undefined' ? width : 1;
    color = typeof(color) != 'color' ? color : '#000';
 
    // 计算各角度和对应的P2,P3坐标
    var angle = Math.atan2(fromY - toY, fromX - toX) * 180 / Math.PI,
        angle1 = (angle + theta) * Math.PI / 180,
        angle2 = (angle - theta) * Math.PI / 180,
        topX = headlen * Math.cos(angle1),
        topY = headlen * Math.sin(angle1),
        botX = headlen * Math.cos(angle2),
        botY = headlen * Math.sin(angle2);
 
    ctx.save();
    ctx.beginPath();
 
    var arrowX = fromX - topX,
        arrowY = fromY - topY;
 
    ctx.moveTo(arrowX, arrowY);
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    arrowX = toX + topX;
    arrowY = toY + topY;
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(toX, toY);
    arrowX = toX + botX;
    arrowY = toY + botY;
    ctx.lineTo(arrowX, arrowY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
}

class AoI{
    constructor(id, fixations, saccades, nFixations){
        this.id = id;
        this.fixations = fixations;
        this.saccades = saccades;

        this.labelLineCount = 0;
        this.colorDict = {
            'safe': "#06d6a0",
            'warning':"#ffd166",
            'danger':"#ef476f",
        };

        this.status = 0; // Updated below, sum of confusionCount
        this.percentage = fixations.length / nFixations;
        this.confusedStudents = new Set(); // Updated below. Students fell confused in this AoI.
        this.students = new Set(); // Updated below. Students in this AoI.

        fixations.forEach((fixation) => {
            if ( !this.students.has(fixation.data.stuNum) ) {
                this.students.add(fixation.data.stuNum);
            }

            if (!this.confusedStudents.has(fixation.data.stuNum) && fixation.data.confusionCount > 0) {
                this.confusedStudents.add(fixation.data.stuNum);
            }
            this.status += fixation.data.confusionCount;
        });

        let min = null;
        this.fixations.forEach((fixation)=>{
            if (!min) {
                min = fixation.xmin;
            } else if (fixation.xmin < min) {
                min = fixation.xmin;
            }
        });
        this.xmin = min;

        min = null;
        this.fixations.forEach((fixation)=>{
            if (!min) {
                min = fixation.ymin;
            } else if (fixation.ymin < min) {
                min = fixation.ymin;
            }
        });
        this.ymin = min;

        let max = null;
        this.fixations.forEach((fixation)=>{
            if (!max) {
                max = fixation.xmax;
            } else if (fixation.xmax > max) {
                max = fixation.xmax;
            }
        });
        this.xmax = max;

        max = null;
        this.fixations.forEach((fixation)=>{
            if (!max) {
                max = fixation.ymax;
            } else if (fixation.ymax > max) {
                max = fixation.ymax;
            }
        });
        this.ymax = max;
    }  

    dispersion2confusion() {

    }
    
    getDwellTime() {
        return this.fixations.reduce((sum, fixation) => {
            return fixation.duration + sum
        }, 0);
    }

    getStatus() {
        let confusedRate = this.confusedStudents.size / this.students.size;
        if (confusedRate < 1/3) return "safe";
        else if (confusedRate < 2/3) return "warning";
        else return "danger";
    }

    draw(ctx, status) {
        ctx.strokeStyle = this.colorDict[status];
        ctx.strokeRect(this.xmin, this.ymin, this.xmax - this.xmin, this.ymax - this.ymin);
    }

    drawRectArea(ctx, status) {
        ctx.globalAlpha = this.percentage;
        ctx.fillStyle = this.colorDict[status];
        ctx.fillRect(this.xmin, this.ymin, this.xmax - this.xmin, this.ymax - this.ymin);
        ctx.globalAlpha = 1;
    }

    addLine(ctx, status, label, value){
        ctx.font = '16px Times';
        ctx.textBaseline = "hanging";

        let text = `${label} : ${value}`;
        let textMetrics = ctx.measureText(text);
        // let lineCount = Math.ceil(textMetrics.width / (this.xmax - this.xmin));
        this.labelLineCount += 1;

        ctx.globalAlpha = this.percentage;
        ctx.fillStyle = this.colorDict[status];
        ctx.fillRect(this.xmin,
            this.ymin - this.labelLineCount*(textMetrics['actualBoundingBoxDescent']+textMetrics['actualBoundingBoxAscent']+8),
            this.xmax - this.xmin,
            textMetrics['actualBoundingBoxDescent']+textMetrics['actualBoundingBoxAscent']+8)
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'black';
        ctx.fillText(text,
            this.xmin,
            this.ymin - this.labelLineCount*(textMetrics['actualBoundingBoxDescent']+textMetrics['actualBoundingBoxAscent']+8),
            this.xmax - this.xmin); // to control maxWidth
        // console.log('LABEL #'+ this.labelLineCount + ':'+ this.labelLineCount*(textMetrics['actualBoundingBoxDescent']+textMetrics['actualBoundingBoxAscent']+8))
    }
}

function AoIBuilder (fixations, saccades, classes) {
    let nClass = Math.max(...classes) + 1;
    let AoIs = [];

    let TMatrix = d3.range(0, nClass).fill(d3.range(0, nClass).fill(0));
    // equals to zeros(nClass, nClass)
    // which creates a nClass x nClass matrix filled with zeros
    console.log(fixations);
    for (let classId of Array(nClass).keys()) {

        let fixationInAoI = [];
        let saccadeInAoI = [];

        let preIdx = classes.indexOf(classId);
        let nextIdx = classes.indexOf(classId, preIdx+1);
        while (nextIdx !== -1) {
            fixationInAoI.push( fixations[preIdx] );
            if ( preIdx + 1 === nextIdx ) {
                saccadeInAoI.push( saccades[preIdx] );
            } else {
                TMatrix[classId][ classes[preIdx + 1] ] += 1;
            }
            preIdx = nextIdx;
            nextIdx = classes.indexOf(classId, nextIdx + 1);
        }
        fixationInAoI.push( fixations[preIdx] );
        if ( preIdx + 1 < classes.length ) TMatrix[classId][ classes[preIdx + 1] ] += 1;

        AoIs.push( new AoI(classId, fixationInAoI, saccadeInAoI, classes.length) )
        // keep fixations and saccades that belong to the specified class
    }

    return [AoIs, TMatrix];
}

function showAoI(AoIs, animationTime) {
    // Powered with d3.js https://d3js.org/
    let t = d3.transition()
            .duration(animationTime);

    let strokeWidth = 10;

    let gSelection = d3.select("#plotting_svg")
                        .selectAll("g.AoI")
                        .data(AoIs)
                        .join(
                            enter => enter.append("g").classed("AoI", true),
                            update => update,
                            exit => exit.call(
                                g => {
                                    g.selectAll("rect")
                                    .transition(t)
                                    .remove()
                                    .attr("width", 0)
                                    .attr("height", 0);

                                    g.selectAll("text")
                                    .transition(t)
                                    .remove()
                                    .text(" ");

                                    g.transition(t).remove();
                        }));
    
    gSelection.selectAll("rect.AoI")
            .data(d => [d])
            .join(
                enter => enter.append("rect")
                            .attr("x", d => d.xmin)
                            .attr("y", d => d.ymin)
                            .attr("width", 0)
                            .attr("height", 0)
                            .style("stroke-width", strokeWidth+"px")
                            .classed("AoI", true),
                update => update,
                exit => exit.remove() // should never be called? remove of <g> should have handled this.
            ).call(rect => rect.transition(t)
                .attr("x", d => d.xmin) // update rects in selection "update"
                .attr("y", d => d.ymin) // update rects in selection "update"
                .attr("width", d => d.xmax - d.xmin)
                .attr("height", d => d.ymax - d.ymin)
                // .style("fill", d => d.colorDict[d.getStatus()])
                .style("fill", "none")
                .style("stroke", d => d.colorDict[d.getStatus()])
                .style('opacity', d => d.percentage)
            );
    
    gSelection.selectAll("text")
            .data(d => [d])
            .join(
                enter => enter.append("text")
                        .attr("x", d => d.xmin)
                        .attr("y", d => d.ymin)
                        .attr("dx", -strokeWidth / 2)
                        .attr("dy", -strokeWidth)
                        .text(d => "#Confusion : "+d.status),
                update => update.text(d => "#Confusion : "+d.status),
                exit => exit.remove() // should never be called? remove of <g> should have handled this.
            )
            .call(s => s.each(function (d) {
                // console.log(this.getBBox());
                return d.bbox = this.getBBox();
            }))
            .transition(t)
            .attr("x", d => d.xmin) // update rects in selection "update"
            .attr("y", d => d.ymin);

    gSelection.selectAll("rect.background")
            .data(d => [d])
            .join(
                enter => enter.insert("rect","text")
                            .attr("x", d => d.xmin - strokeWidth / 2)
                            .attr("y", d => d.ymin - d.bbox.height - strokeWidth / 2)
                            .attr("width", 0)
                            .attr("height", 0)
                            .classed("background", true),
                update => update,
                exit => exit.remove()
            ).transition(t)
            .attr("x", d => d.xmin -strokeWidth / 2) // update rects in selection "update"
            .attr("y", d => d.ymin - d.bbox.height - strokeWidth / 2) // update rects in selection "update"
            .attr("width", d => d.bbox.width + strokeWidth) // the background extends a little bit
            .attr("height", d => d.bbox.height)
            .style("fill", d => d.colorDict[d.getStatus()])
            .style("opacity", d => d.percentage);
}

function showTransition(AoIs, TMatrix, animationTime) {
    let nTransition = d3.sum(d3.merge(TMatrix));

    let gSelection = d3.select("#plotting_svg")
        .selectAll("g.transition")
        .data(TMatrix)
        .join("g")
        .classed("transition", true);

    if (TMatrix.length === 1 || nTransition === 0) {
        gSelection.selectAll("path").data([]).exit(g=>g.remove());
        return;
    } // No transition

    let t = d3.transition()
            .duration(animationTime);
    let theta = 30;
    let arrowLen = 20;
    let margin = 10;
    let arrowWidth = 20;

    let AoIX = [];
    let AoIY = [];

    AoIs.forEach((AoI)=>{
        AoIX[AoI.id] = ( (AoI.xmin + AoI.xmax) / 2 );
        AoIY[AoI.id] = ( (AoI.ymin + AoI.ymax) / 2 ) + 1;
        // for transition calculation, otherwise initial arrow state calculation will thrwo error
    });

    gSelection.selectAll("path")
        .data( (d, i) => {
            let dataList = [];
            for (let j = 0; j < d.length; j++) {
                dataList.push({count:d[j],fixationId:i})
            }
            return dataList
        })
        .join("path")
        .attr("d", (d, i) => arrowGenerator(
            AoIX[d.fixationId], AoIY[d.fixationId], AoIX[d.fixationId]+5, AoIY[d.fixationId]+5, arrowWidth*d.count/nTransition, theta, arrowLen
        ))
        .attr("stroke", "#000")
        // .attr("fill", "url(#arrowGradient)")
        // .attr("stroke-width", d => arrowWidth*d.count/nTransition)
        .attr("opacity", d => d.count/nTransition)
        .transition(t)
        .attr("d", (d, i) => arrowGenerator(
            AoIX[d.fixationId], AoIY[d.fixationId], AoIX[i], AoIY[i], arrowWidth*d.count/nTransition, theta, arrowLen
        ))
}

function arrowGenerator(fromX, fromY, toX, toY, width, theta,headlen) {
    //         P4
    //         |\
    //       P5| \ 
    // P6------|  \ 
    // |           \P3 (toX, toY)
    // |           /
    // P0------|  /
    //       P1| /
    //         |/ 
    //         P2 

    let pathString = "";

    theta = typeof(theta) != 'undefined' ? theta : 30;
    headlen = typeof(headlen) != 'undefined' ? headlen : 10;

    let angle = Math.atan2(toY - fromY, toX - fromX);
    let k = Math.tan(angle);
    let perpendicularAngle = angle - Math.PI / 2;

    let p0x = fromX + width / 2 * Math.cos(perpendicularAngle);
    let p0y = fromY + (width / 2 * Math.sin(perpendicularAngle)); // y axis is inversed in JS 

    let p1x = (toX - headlen * Math.cos(angle)) + width / 2 * Math.cos(perpendicularAngle);
    let p1y = (toY - headlen * Math.sin(angle)) + width / 2 * Math.sin(perpendicularAngle);

    let p2x = p1x + width * Math.cos(perpendicularAngle);
    let p2y = p1y + (width * Math.sin(perpendicularAngle));

    let p6x = fromX - width / 2 * Math.cos(perpendicularAngle);
    let p6y = fromY - (width / 2 * Math.sin(perpendicularAngle));

    let p5x = (toX - headlen * Math.cos(angle)) - width / 2 * Math.cos(perpendicularAngle);
    let p5y = (toY - headlen * Math.sin(angle)) - width / 2 * Math.sin(perpendicularAngle);

    let p4x = p5x - width * Math.cos(perpendicularAngle);
    let p4y = p5y - width * Math.sin(perpendicularAngle);

    let curveAngle = angle - theta * Math.PI / 180;
    let curveLength = Math.round(Math.sqrt(Math.pow(fromY - toY, 2) + Math.pow(fromX - toX, 2)) * 0.1);

    let fromDX = curveLength * Math.cos(curveAngle);
    let fromDY = curveLength * Math.sin(curveAngle); // for Bézier Curves

    let toDX, toDY;
    if (k === Infinity || k === -Infinity){
        toDX = fromDX;
        toDY = -fromDY; // for Bézier Curves
    } else if (k === 0) {
        toDX = -fromDX;
        toDY = fromDY; // for Bézier Curves 
    } else {
        toDX = -(- fromDX*k*k + 2*fromDY*k + fromDX)/(k*k + 1);
        toDY = -(fromDY*k*k + 2*fromDX*k - fromDY)/(k*k + 1);
    }

    pathString += `M ${p0x} ${p0y} `;
    pathString += `C ${p0x + fromDX} ${p0y + fromDY}, ${(p1x + toDX)} ${(p1y + toDY)}, ${p1x} ${p1y} `;
    pathString += `L ${p2x} ${p2y} `;
    pathString += `L ${toX} ${toY} `;
    pathString += `L ${p4x} ${p4y} `;
    pathString += `L ${p5x} ${p5y} `;
    pathString += `C ${p5x + toDX} ${p5y + toDY}, ${(p6x + fromDX)} ${(p6y + fromDY)}, ${p6x} ${p6y} `;
    pathString += `Z`; // Z for close path

    // console.log(`angle: ${angle * 180 / Math.PI},  fromDX : ${fromDX}, fromDY : ${fromDY}, toDX : ${toDX}, toDY : ${toDY}`)
    // console.log(`Path genera ted : ${pathString}`);

    return pathString;
}

class SaliencyAoI{
    constructor(slideId, aoiId, upper_left_point, lower_right_point, confusedRate, percentage) {
        this.slideId = slideId;
        this.aoiId = aoiId;
        this.xmin = upper_left_point[0];
        this.ymin = upper_left_point[1];
        this.xmax = lower_right_point[0];
        this.ymax = lower_right_point[1];

        this.colorDict = {
            'safe': "#06d6a0",
            'warning':"#ffd166",
            'danger':"#ef476f",
            'neutral': "#ef476f",
        };

        this.confusedRate = confusedRate;
        this.percentage = percentage;
    }

    getStatus() {
        if (this.confusedRate < 1/3) return "safe";
        else if (this.confusedRate < 2/3) return "warning";
        else return "danger";
    }

    get DOMid() {
        return ["slide", this.slideId, "aoi", this.aoiId].join("-")
    }

    /**
     * Used to compare two AoIs. Only coordinate and slide id are cared.
     * @returns {*[]}
     */
    get keyProps() {
        return [
            this.slideId,
            this.xmin, this.ymin, this.xmax, this.ymax,
        ]
    }
}
