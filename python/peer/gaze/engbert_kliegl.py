import numpy as np
import pandas as pd

from collections.abc import Mapping, Sequence

from typing import List

from .gaze_classes import Fixation, Saccade


class FixationDetector:
    def detect(self):
        pass


def kernel(x, k, padmode="original"):
    """Self-implemented convolution."""
    r = np.convolve(x, k[::-1], "valid")
    pad_length = (len(k) - 1) // 2

    if padmode == "result":
        # use computed result to fill empty
        return np.concatenate((r[0:pad_length], r, r[-pad_length:]))
    elif padmode == "original":
        # use original value to fill empty
        return np.concatenate((x[0:pad_length], r, x[-pad_length:]))
    elif padmode == "none":
        # Do not pad
        return r
    else:
        raise ValueError('Invalid padding mode in function kernel()! Either original, result, or none.')


def median_filter(x, window):
    """Implement a median filter."""
    pad_length = window // 2
    pad_x = np.pad(x, pad_length, "edge")
    mat = np.array([np.roll(pad_x, i) for i in range(-pad_length, pad_length + 1)])
    return np.median(mat[:, pad_length:-pad_length], axis=0)


class EKDetector:
    def __init__(self):
        """Detect fixations and saccades from a stream of eye positions recorded by an eye-tracker.

        The detection is done using an algorithm for saccade detection proposed by Ralf Engbert and Reinhold Kliegl [1]_.
        Anything that happens between two saccades is considered to be a fixation.

        .. [1] Ralf Engbert, Reinhold Kliegl: Microsaccades uncover the orientation of covert attention
           , Vision Research, 2003.
        """
        self.ptr = 0
        self.vxBuffer = []
        self.vyBuffer = []

    def __call__(self, samples, **kargs):
        """Classifies gaze data into fixations and saccades.

        :param samples: Containing timestamp, x coordinates and y coordinates. Can be:
            1. A pandas dataframe containing fields "timestamp", "x", "y";
            2. A mapping containing keys "timestamp", "x", "y", and each is a list or np.ndarray;
            3. A sequence containing three lists or np.ndarrays, following the order "timestamp", "x", "y".

        :return A tuple containing the classification results.
            (fixations list[Fixation], saccades list[Saccade])
        """
        return self.detect(samples, **kargs)

    def detect(self, samples, buf_size: int = 20, lam: float = 3, smooth_coordinate: bool = False,
               smooth_type: str = "median", window: int = 3, smooth_saccades: bool = False,
               smooth_artifacts: bool = False, artifact_lam: float = 3, one_shot: bool = False):
        """Classifies gaze data into fixations and saccades.

        :param samples: Containing timestamp, x coordinates and y coordinates. Can be:
            1. A pandas dataframe containing fields "timestamp", "x", "y";
            2. A mapping containing keys "timestamp", "x", "y", and each is a list or np.ndarray;
            3. A sequence containing three lists or np.ndarrays, following the order "timestamp", "x", "y".
        :param buf_size: Determines the size of buffer. The buffer holds velocity to decide the threshold.
        :param lam: Determine the value of threshold. A larger lam lead to a higher threshold, and applies to a more noisy case.
        :param smooth_coordinate: Whether to smooth raw gaze data.
        :param smooth_type: The smooth filter used in smooth_coordinate. Possible values are:
            1. "median" uses the median filter.
            2. "mean" uses the mean filter.
        :param window: Length of the filter used to smooth gaze data.
        :param smooth_saccades: Whether to smooth the detection of saccade.
        :param smooth_artifacts: Whether to smooth the blinks/artifacts based on fixation dispersion and duration.
        :param artifact_lam: Determine the value of threshold. It is used when smooth_artifacts=True.
        :param one_shot: The full stream of data is provided. Setting this to true leads to clear the velocity buffer.
        :return: A tuple containing the classified fixation results.
            (fixations list[Fixation], saccades list[Saccade])
        :raises KeyError: The input mapping/dataframe does not have required keys (x, y, timestamp).
        :raises TypeError: The input samples are not sequences, mappings or dataframes.
        :raises ValueError: The smooth_type specifies a filter rather than supported types.
        """
        self.buf_size = buf_size
        self.lam = lam
        self.artifact_lam = artifact_lam

        x, y, t = self.parse_samples(samples)

        if x.shape[0] == 0:
            return [[], []]

        x_clean, y_clean, t_clean, cleansing_mask = self._data_cleansing(x, y, t)

        if smooth_coordinate:
            if smooth_type == "median":
                x_clean = median_filter(x_clean)
                y_clean = median_filter(y_clean)
            elif smooth_type == "mean":
                x_clean = kernel(x_clean, np.ones((window,)) / window)
                y_clean = kernel(y_clean, np.ones((window,)) / window)
            else:
                # filter name is not supported.
                raise ValueError("Not supported smooth filter type. smooth_type='median' or 'mean'.")

        saccade_mask, vx, vy = self._detect_saccade(x_clean, y_clean, t_clean)
        if smooth_saccades:
            saccade_mask = kernel(saccade_mask, np.ones((window,)) / window) > 0.5

        if smooth_artifacts:
            saccade_mask = self._detect_artifact(x_clean, y_clean, t_clean, saccade_mask)
            # fixations = [fixations[i] for i in np.arange(len(mask), dtype=int)[mask]]

        recovered_saccade_mask, vx, vy = self._recover_original_shape(saccade_mask, vx, vy, cleansing_mask)
        fixations, saccades = self._aggregate_fixations(x, y, t, vx, vy, recovered_saccade_mask)

        if one_shot:
            self._reset()

        return fixations, saccades

    def parse_samples(self, samples):
        if isinstance(samples, pd.DataFrame):
            try:
                x = samples["x"]
                y = samples["y"]
                t = samples["timestamp"]
            except KeyError:
                raise KeyError("The dataframe should have columns as x, y and timestamp.")
        elif isinstance(samples, Mapping):
            try:
                x = samples["x"]
                y = samples["y"]
                t = samples["timestamp"]
            except KeyError:
                raise KeyError("The mapping should have keys as x, y and timestamp.")
        elif isinstance(samples, Sequence):
            try:
                t = samples[0]
                x = samples[1]
                y = samples[2]
            except KeyError:
                raise KeyError("The sequence should have 3 elements and they will be implicitly interpreted as "
                               "0:timestamp, 1:x, 2:y.")
        else:
            raise TypeError("Input data samples have wrong type. Either pandas dataframe, mapping or sequence is "
                            "accepted.")

        return np.array(x), np.array(y), np.array(t)

    def _detect_saccade(self, x, y, t):
        """
        Calculate the velocity of each gaze point. High-velocity points are saccades and all other points are fixations.
        :param x: A numpy array of x coordinates.
        :param y: A numpy array of y coordinates.
        :param t: A numpy array of corresponding timestamp for each gaze point.
        :return: A numpy array of boolean values indicating whether the point is saccade or not.
        """
        dt = kernel(t, [-1, 0, 1], "result")
        vx = kernel(x, [-1, 0, 1], "result") / dt
        vy = kernel(y, [-1, 0, 1], "result") / dt

        # Update history buffer to compute more accurate threshold
        if self.ptr < self.buf_size:
            self.vxBuffer.append(vx)
            self.vyBuffer.append(vy)
        else:
            self.vxBuffer[self.ptr % self.buf_size] = vx
            self.vyBuffer[self.ptr % self.buf_size] = vy
        self.ptr += 1
        # in case of ptr overflow...
        if self.ptr > 200 * self.buf_size:
            self.ptr = self.buf_size + self.ptr % self.buf_size

        # get velocity threshold
        vx_all = np.concatenate(self.vxBuffer)
        vy_all = np.concatenate(self.vyBuffer)

        # threshold_x/threshold_y are scalars
        threshold_x = np.sqrt(
            np.median(np.power(vx_all, 2)) - np.power(np.median(vx_all), 2)
        ) * self.lam
        threshold_y = np.sqrt(
            np.median(np.power(vy_all, 2)) - np.power(np.median(vy_all), 2)
        ) * self.lam

        # saccade_mask = np.power(vx / threshold_x, 2) + np.power(vy / threshold_y, 2) > 1
        saccade_mask = np.logical_and(np.power(vx / threshold_x, 2) > 1, np.power(vy / threshold_y, 2) > 1)
        return saccade_mask, vx, vy

    def _aggregate_fixations(self, x, y, t, vx, vy, saccade_mask):
        """
        Create saccade and fixation instances using the saccade mask.
        :param x: A numpy array of x coordinates.
        :param y: A numpy array of y coordinates.
        :param t: A numpy array of corresponding timestamp for each gaze point.
        :param vx: A numpy array of velocity on the x direction.
        :param vy: A numpy array of velocity on the y direction.
        :param saccade_mask: A numpy array of boolean values indicating whether the point is saccade or not.
        :return:
        """
        fixations = []
        saccades = []

        sacc_index = self._get_index(saccade_mask)
        fix_index = self._get_index(np.logical_not(saccade_mask))

        for (start, end) in sacc_index:
            saccades.append(Saccade(
                x[start:end], y[start:end], vx[start:end], vy[start:end], t[start:end], (start, end)
            ))

        for (start, end) in fix_index:
            fixations.append(Fixation(
                x[start:end], y[start:end], t[start:end], (start, end)
            ))

        return fixations, saccades

    def _detect_artifact(self, x, y, t, saccade_mask):
        """EXPERIMENTAL: Detect blinks and artifacts based on x- and y-dispersion and duration of fixations.

        New criterion:
        1. Duration larger than 100 ms, and
        2. The x- and y-dispersions do not exceed the threshold.
        """
        fix_index = self._get_index(np.logical_not(saccade_mask))

        mad_x = []
        mad_y = []
        duration = []
        for (start, end) in fix_index:
            mad_x_temp = np.median(np.abs(x[start:end] - np.median(x[start:end])))
            mad_y_temp = np.median(np.abs(y[start:end] - np.median(y[start:end])))
            if mad_x_temp > 0 and mad_y_temp > 0:
                mad_x.append(mad_x_temp)
                mad_y.append(mad_y_temp)
            duration.append(t[end - 1] - t[start])

        # Blink and artifact detection based on dispersion:
        log_mad_x = np.log10(mad_x)
        median_log_mad_x = np.median(log_mad_x)
        # no np.abs!
        centralized_log_mad_x = log_mad_x - median_log_mad_x
        mad_log_mad_x = np.median(centralized_log_mad_x)

        log_mad_y = np.log10(mad_y)
        median_log_mad_y = np.median(log_mad_y)
        # no np.abs!
        centralized_log_mad_y = log_mad_y - median_log_mad_y
        mad_log_mad_y = np.median(centralized_log_mad_y)

        # Dispersion too low -> blink:
        # Dispersion too high -> artifact: (now we only consider this)
        # dispersion_mask is masked over fixations
        dispersion_mask = np.logical_and(
            centralized_log_mad_x > self.artifact_lam * mad_log_mad_x,
            centralized_log_mad_y > self.artifact_lam * mad_log_mad_y,
        )

        # Artifact detection based on duration:
        # median_inv_dur = np.median(inv_duration)
        # mad_inv_dur = np.median(np.abs(inv_dur - median_inv_dur))

        # Duration too short -> artifact:
        # duration_mask = inv_dur > median_inv_dur + self.artifact_lam * mad_inv_dur
        duration = np.array(duration)
        duration_mask = duration < 100

        # fixations to be removed
        dispersion_mask = np.zeros_like(duration_mask)
        mask = np.logical_or(dispersion_mask, duration_mask)
        # print("{} fixation(s) to be removed.".format(np.sum(mask)))

        # Edit the mask
        saccade_mask_copy = saccade_mask.copy()
        for index, artifactFlag in enumerate(mask):
            if artifactFlag:
                start, end = fix_index[index]
                saccade_mask_copy[start:end] = True

        return saccade_mask_copy

    def _data_cleansing(self, x, y, t):
        """Remove gaze points that are sharing the same timestamp.
        """
        x_c = x.copy()
        y_c = y.copy()
        t_c = t.copy()

        dt = np.concatenate([[1], np.diff(t_c)])
        same_timestamp_mask = dt == 0

        return x_c[~same_timestamp_mask], y_c[~same_timestamp_mask], t_c[~same_timestamp_mask], same_timestamp_mask

    def _recover_original_shape(self, saccade_mask, vx, vy, cleansing_mask):
        """Recover the original length before data cleasing.
        """
        if len(cleansing_mask) == len(saccade_mask):
            return saccade_mask, vx, vy

        recovered_mask = np.empty_like(cleansing_mask)
        recovered_mask[~cleansing_mask] = saccade_mask

        recovered_vx = np.empty_like(cleansing_mask)
        recovered_vy = np.empty_like(cleansing_mask)
        recovered_vx[~cleansing_mask] = vx
        recovered_vy[~cleansing_mask] = vy

        last_index = -1
        for index in np.arange(len(cleansing_mask))[cleansing_mask]:
            recovered_mask[index] = recovered_mask[index - 1]
            recovered_vx[index] = recovered_vx[index - 1]
            recovered_vy[index] = recovered_vy[index - 1]

        return recovered_mask, recovered_vx, recovered_vy

    def _get_index(self, mask):
        """Convert the boolean mask to a list of start and end that can be used for slicing."""
        index = []
        find_start = True
        valid_index = np.arange(len(mask))[mask]

        if not len(valid_index):
            return index

        for i in valid_index:
            if find_start:
                start = i
                current = i
                find_start = False
            else:
                if i - current > 1:
                    index.append((start, current + 1))
                    start = i
                    current = i
                else:
                    current = i
        index.append((start, current + 1))

        return index

    def _reset(self):
        """Reset internal states."""
        self.ptr = 0
        self.vxBuffer = []
        self.vyBuffer = []


class EKPartialDetector(EKDetector):
    def detect_threshold(self, samples, thresholds: List[float], window: int = 3, smooth_saccades: bool = False,
                         smooth_artifacts: bool = False, artifact_lam: float = 3, return_fixation_mask:bool = False):
        """Classifies gaze data into fixations and saccades with given velocity thresholds.

        :param samples: Containing timestamp, x coordinates and y coordinates. Can be:
            1. A pandas dataframe containing fields "timestamp", "x", "y";
            2. A mapping containing keys "timestamp", "x", "y", and each is a list or np.ndarray;
            3. A sequence containing three lists or np.ndarrays, following the order "timestamp", "x", "y".
        :param thresholds:
        :param window: Length of the filter used to smooth gaze data.
        :param smooth_saccades: Whether to smooth the detection of saccade.
        :param smooth_artifacts: Whether to smooth the blinks/artifacts based on fixation dispersion and duration.
        :param artifact_lam: Determine the value of threshold. It is used when smooth_artifacts=True.
        :param return_fixation_mask: Whether to return the fixation mask or not.
        :return: A tuple containing the classified fixation results, possibly with fixation_mask.
            (fixations list[Fixation], saccades list[Saccade], [fixation_mask] ndarray[boolean])
        :raises KeyError: The input mapping/dataframe does not have required keys (x, y, timestamp).
        :raises TypeError: The input samples are not sequences, mappings or dataframes.
        :raises ValueError: The smooth_type specifies a filter rather than supported types.
        """
        self.artificial_lam = artifact_lam

        x, y, t = self.parse_samples(samples)

        if x.shape[0] == 0:
            return [[], []]

        saccade_mask, vx, vy = self.threshold_to_mask(x, y, t, *thresholds)

        if smooth_saccades:
            saccade_mask = kernel(saccade_mask, np.ones((window,)) / window) > 0.5

        if smooth_artifacts:
            saccade_mask = self._detect_artifact(x, y, t, saccade_mask)
            # fixations = [fixations[i] for i in np.arange(len(mask), dtype=int)[mask]]

        fixations, saccades = self._aggregate_fixations(x, y, t, vx, vy, saccade_mask)

        if return_fixation_mask:
            return fixations, saccades, saccade_mask
        else:
            return fixations, saccades

    @staticmethod
    def threshold_to_mask(x, y, t, threshold_x, threshold_y):
        """
        Returns the saccade mask based on the velocity threshold on x and y directions.
        :param x: A numpy array of x coordinates.
        :param y: A numpy array of y coordinates.
        :param t: A numpy array of corresponding timestamp for each gaze point.
        :param threshold_x: The velocity threshold on the x direction for determining saccade/fixation.
        :param threshold_y: The velocity threshold on the y direction for determining saccade/fixation.
        :return: A tuple of the saccade mask, the numpy array of velocity on x direction, and y direction.
        """
        dt = kernel(t, [-1, 0, 1], "result")
        vx = kernel(x, [-1, 0, 1], "result") / dt
        vy = kernel(y, [-1, 0, 1], "result") / dt

        # saccade_mask = np.power(vx / threshold_x, 2) + np.power(vy / threshold_y, 2) > 1
        saccade_mask = np.logical_and(np.power(vx / threshold_x, 2) > 1, np.power(vy / threshold_y, 2) > 1)
        return saccade_mask, vx, vy


if __name__ == "__main__":
    import matplotlib.pyplot as plt
    from matplotlib.collections import PatchCollection
    from matplotlib.patches import Rectangle

    detector = EKDetector()

    df = pd.read_csv("15f0a3.csv")
    df = df[~pd.isna(df.gazeX)]
    df = df.rename(columns={"gazeX": "x", "gazeY": "y"})

    length = 100

    f, s = detector(df[:length], lam=6, smooth_saccades=True)
    print(len(f))
    print(len(s))

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(df.loc[:length, "x"] + 1, df.loc[:length, "y"] + 1, 'ob', markersize=5)
    ax.plot(median_filter(df.loc[:length, "x"]), median_filter(df.loc[:length, "y"]), 'or',
            markersize=5)
    recs = [Rectangle(
        (fixation.x_min, fixation.y_min),
        fixation.x_max - fixation.x_min,
        fixation.y_max - fixation.y_min
    ) for fixation in f]

    pc = PatchCollection(recs, fc="green", alpha=0.2, ec="red")
    ax.add_collection(pc)
    plt.show()
