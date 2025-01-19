from skimage.morphology import disk, square, dilation
from skimage.measure import label
from skimage.filters import threshold_otsu
from skimage.util import invert
from skimage.transform import resize

from sklearn.cluster import KMeans

import numpy as np
from scipy.spatial import ConvexHull
from typing import Dict, Tuple


class Clusterer:
    """The interface where all Clusterer should implement."""

    def cluster(self, fixations: Dict[str, list]) -> Dict[str, list]:
        pass


class SaliencyClusterer(Clusterer):
    """The clusterer based on the saliency of a pic (slide screenshot)."""

    def __init__(self, struct_element_type: str, struct_element_shape: int, max_area: float = 0.15,
                 min_area: float = 0.01) -> None:
        """Initialize the saliency-based clusterer.

        :param struct_element_type: The type of structure element used.
            Possible values: square, disk
        :param struct_element_shape: The shape of structure element.
        :raise ValueError: Raise when the struct_element_type is invalid.
        """
        self._struct_element_shape = struct_element_shape
        self._struct_element_type = struct_element_type.lower()
        self.max_area = max_area
        self.min_area = min_area

        if self._struct_element_type == 'square':
            self._struct_elem = square(struct_element_shape)
        elif self._struct_element_type == 'disk':
            self._struct_elem = disk(struct_element_shape)
        else:
            raise ValueError(
                "Invalid struct element type! Valid types: square, disk, got {}".format(struct_element_type))

        """All convex hulls."""
        self.chulls_ = []
        """All AoIs."""
        self.rects_ = []
        """Number of AoIs."""
        self.n_classes_ = 0
        """Shape of the image to be processed"""
        self.w_ = 960
        self.h_ = 540

    def get_salient_regions(self, pic, return_rects: bool = False):
        """Generate the saliency map of a given pic (slide screenshot).

        The full procedure:
        Dilate -> Binarize -> Connect Components -> Convex Hulls

        :param pic: the gray-scale picture to be process.
        :param return_rects: Specify whether to return convex hulls or rectangles.
        :return: A list of convex hull (rectangle if `return_rects = True`) vertices. list[list (N_vertices, 2)]
        """
        pic = invert(pic)
        # Step 0: Resize the image
        pic = resize(pic, (self.h_, self.w_), anti_aliasing=True)
        # Step 1: Dilate
        dilated_pic = dilation(pic, self._struct_elem)
        # Step 2: Binarize
        thresh = threshold_otsu(dilated_pic)
        bin_pic = dilated_pic > thresh
        # Step 3: Find connect components
        (component, num) = label(bin_pic, return_num=True)
        # Step 4: Construct convex hull for each connect component
        chulls = []
        for i in range(num):
            coordinates = np.asarray(component == i + 1).T.nonzero()  # Tuple (N_component, N_component)
            coordinates = np.array(coordinates).T  # N_component x 2
            coordinates = coordinates / np.array((self.w_, self.h_))
            chull = ConvexHull(coordinates)
            chulls.append(coordinates[chull.vertices])  # N_vertices x 2. chull.vertices are indices

        self.chulls_, self.rects_ = self.sort_chulls_by_rectangles(chulls)
        self.n_classes_ = len(chulls)

        return self.rects_ if return_rects else self.chulls_

    def get_salient_regions_hierarchy(self, pic, return_rects: bool = False):
        """Generate the saliency map of a given pic (slide screenshot) with hierarchy.

        The algorithm starts with the defined size of struct element and then decreases to a size of 5 with a step of 1.
        Convex hulls with area between than self.min_area and self.max_area will be kept, and otherwise discarded.
        The whole procedure if almost the same as in `get_salient_regions()`.

        :param pic: the gray-scale picture to be process.
        :param return_rects: Specify whether to return convex hulls or rectangles.
        :return: A list of convex hull (rectangle if `return_rects = True`) vertices. list[list (N_vertices, 2)]
        """
        pic = invert(pic)
        # Step 0: Resize the image
        pic = resize(pic, (self.h_, self.w_), anti_aliasing=True)
        # Step 1: Dilate
        dilated_pic = dilation(pic, self._struct_elem)
        # Step 2: Binarize
        thresh = threshold_otsu(dilated_pic)

        chulls = []
        for elem_size in range(self._struct_element_shape, 5, -1):
            struct_elem = eval("{}({})".format(self._struct_element_type, elem_size))
            # Step 1: Dilate
            dilated_pic = dilation(pic, struct_elem)
            # Step 2: Binarize
            bin_pic = dilated_pic > thresh
            # Step 3: Find connect components
            (component, num) = label(bin_pic, return_num=True)
            # Step 4: Construct convex hull for each connect component
            for i in range(num):
                coordinates = np.asarray(component == i + 1).T.nonzero()  # Tuple (N_component, N_component)
                coordinates = np.array(coordinates).T  # N_component x 2
                coordinates = coordinates / np.array((self.w_, self.h_))
                chull = ConvexHull(coordinates)
                if self.max_area > chull.volume > self.min_area:
                    # the aoi is not too large
                    chull_coord = coordinates[chull.vertices]  # N_vertices x 2. chull.vertices are indices
                    chulls.append(chull_coord)
                    xmin = round(chull_coord[:, 0].min() * self.w_)
                    xmax = round(chull_coord[:, 0].max() * self.w_)
                    ymin = round(chull_coord[:, 1].min() * self.h_)
                    ymax = round(chull_coord[:, 1].max() * self.h_)
                    pic[ymin:ymax + 1, xmin:xmax + 1] = 0  # remove this part form the original image

        self.chulls_, self.rects_ = self.sort_chulls_by_rectangles(chulls)
        self.n_classes_ = len(chulls)

        return self.rects_ if return_rects else self.chulls_

    @staticmethod
    def sort_chulls_by_rectangles(chulls: list) -> Tuple[list, list]:
        """Sort convex hulls according to the related minimal rectangle that contains the convex hull.
        The return convex hulls are ordered by the rectangles:
         1) from left to the right and then 2) from the top to the bottom.

        :param chulls: A list of convex hull coordinates.
        :return: Ordered convex hulls in a list, and the corresponding ordered rectangles.
        """
        rects = []
        np_chulls = []
        for i, chull in enumerate(chulls):
            # chull: ndarray, size N_vertices x 2
            chull = np.array(chull)
            xmin = chull[:, 0].min()
            xmax = chull[:, 0].max()
            ymin = chull[:, 1].min()
            ymax = chull[:, 1].max()
            rects.append(np.array([[xmin, ymin], [xmax, ymax]]))
            np_chulls.append(chull)

        # sort by the rectangles: 1) from left to the right and then 2) from the top to the bottom.
        indices = list(range(len(chulls)))
        indices.sort(key=lambda index: rects[index][0, 1])  # first sort by the secondary key (ymin)
        indices.sort(key=lambda index: rects[index][0, 0])  # then sort by the primary key (xmin)

        # reorder the convex hulls and rectangles
        ordered_chulls = [np_chulls[i].tolist() for i in indices]
        ordered_rects = [rects[i].tolist() for i in indices]

        return ordered_chulls, ordered_rects

    def distance_point_segment(self, point, line_endpoints):
        """
        Calculate the distance between a point and a line segment.

        :param point: The point. Can be an array or a list of 2 numbers. [x, y].
        :param line_endpoints: A list of 2 points specifies the line segment. [[x_1, y_1], [x_2, y_2]].
        :return: The distance between the given point and the line segment.
        """
        p1 = np.array(line_endpoints[0])
        p2 = np.array(line_endpoints[1])
        p = np.array(point)

        u = p2 - p1
        v = p - p1

        proj = np.inner(u, v) / np.inner(u, u)
        if proj < 0:
            d = np.linalg.norm(v)
        elif proj > 1:
            d = np.linalg.norm(p - p2)
        else:
            w = p1 + proj * u  # Projection on the line
            d = np.linalg.norm(p - w)
        return d

    def distance_point_chull(self, point, chull_vertices):
        """
        Calculate the distance between a point and a convex hull.

        The distance is defined as the minimum of all distances between the point and each side of the convex hull.

        :param point: The point. Can be an array or a list of 2 numbers. [x, y].
        :param chull_vertices: A list of coordinates specifies the convex hull. Shape: [n_vertices, 2].
        :return: The distance between the point and the convex hull.
        """
        dist = []
        num_vertices = len(chull_vertices)
        for i in range(num_vertices):
            dist.append(
                self.distance_point_segment(
                    point, [chull_vertices[i], chull_vertices[(i + 1) % num_vertices]]
                )
            )
        return min(dist)

    def cluster_with_given_chulls(self, fixations: Dict[str, list], chulls: list) -> Dict[str, list]:
        """A wrapper of the cluster method in order to use a convex hull calculated from other gunicorn workers.

        :param fixations: A dictionary of fixations. dict[userid: list[Fixations]].
            Fixation must have two properties: x and y.
        :param chulls: A list of convex hull coordinates.
        :return: A dictionary of AoI indices. dict[userid: list[AoI indices]]
        """
        self.chulls_, self.rects_ = self.sort_chulls_by_rectangles(chulls)
        return self.cluster(fixations)

    def cluster(self, fixations: Dict[str, list]) -> Dict[str, list]:
        """Align fixations with areas of interest (AoIs) / salient regions.
        Implementation of the interface.

        :param fixations: A dictionary of fixations. dict[userid: list[Fixations]].
            Fixation must have two properties: x and y.
        :return: A dictionary of AoI indices. dict[userid: list[AoI indices]]
        """
        result = {}
        for user_id, fixation_list in fixations.items():
            categories = []
            for fixation in fixation_list:
                dist = []
                for chull_vertices in self.chulls_:
                    dist.append(
                        self.distance_point_chull([fixation.x, fixation.y], chull_vertices)
                    )
                c = dist.index(min(dist))
                categories.append(c)

            result[user_id] = categories
        return result


class SpectralClusterer(Clusterer):
    """The clusterer based on the geometric relationship of fixation points."""

    def cluster(self, fixations: Dict[str, list]) -> Dict[str, list]:
        """Align fixations with areas of interest (AoIs) / salient regions.
        Implementation of the interface.

        :param fixations: A dictionary of fixations. dict[userid: list[Fixations]]
        :return: A dictionary of AoI indices. dict[userid: list[AoI indices]]
        """
        points = []
        for fixation_list in fixations.values():
            for fixation in fixation_list:
                points.append([fixation.x, fixation.y])
        points = np.array(points)

        if points.shape[0] == 0:
            return {k: [] for k in fixations.keys()}

        distance_matrix = self.cal_euclid_distance_matrix(points)
        # print("distance_matrix:", distance_matrix)
        # adjacent_matrix = epsilon(distance_matrix)
        adjacent_matrix = self.all_connect(distance_matrix, sigma=1)
        # print("adjacent_matrix:", adjacent_matrix)
        laplacian_matrix = self.cal_laplacian_matrix(adjacent_matrix)
        # print("LaplacianMatrix:",laplacian_matrix)

        lam, V = np.linalg.eig(laplacian_matrix)
        lam_sort = lam[np.argsort(lam)]

        k = np.argmax(np.diff(lam_sort[:lam_sort.shape[0] // 2 + 1])) + 1
        optimal_k = k
        # print("lam:",lam)
        # print("lam_sort: ",lam_sort)
        lam = list(zip(lam, range(len(lam))))

        # print("V:",V)
        H = np.vstack([V[:, i] for (v, i) in lam[:500]]).T
        sp_kmeans = KMeans(n_clusters=optimal_k).fit(points)
        best_cluster = sp_kmeans.labels_
        all_result = [int(c) for c in best_cluster]

        print("-------------------------------------------")
        # constructing results
        result = {}
        start = 0
        for user_id, fixation_list in fixations.items():
            result[user_id] = all_result[start:start + len(fixation_list)]
            start = start + len(fixation_list)
        return result

    def cal_euclid_distance_matrix(self, points):
        """Calculate the distance matrix of all points.
        
        :param points: ndarray with shape of (N_points, 2)
        :return: The distance matrix D, where D[i, j] = ||(xi - xj, yi - yj)||^2
        """
        X = points[:, 0]
        Y = points[:, 1]
        D = np.sqrt(np.power(X - X.T, 2) + np.power(Y - Y.T, 2))
        return D

    def all_connect(self, D, sigma=1.0):
        """Calculate the adjacent matrix based on the distance matrix.
        
        :param D: The distance matrix where D[i, j] = ||(xi - xj, yi - yj)||^2.
        :return: The adjacent matrix A, where A[i, j] = exp( - D[i, j] / (2 sigma^2)).
        """
        A = np.exp(-D / (2 * sigma * sigma))
        A = A - np.eye(A.shape[0])  # diagonal elements should be zero
        return A

    def cal_laplacian_matrix(self, A):
        """Calculate the normalized laplacian of the adjacent matrix.
        
        :param A: The adjacent matrix A, where A[i, j] = exp( - D[i, j] / (2 sigma^2)).
        :return: The normalized laplacian of A, where L = De^(-1/2) (De - A) De^(-1/2)
        """
        # compute the Degree Matrix: D = sum(A)
        degree_matrix = np.sum(A, axis=1)
        # compute the Laplacian Matrix: L=D-A
        laplacian_matrix = np.diag(degree_matrix) - A
        # normalize D^(-1/2) L D^(-1/2)
        sqrt_degree_matrix = np.diag(1.0 / (degree_matrix ** 0.5))
        # @ = np.matmul / np.dot when 2 params are 2d-arrays
        return sqrt_degree_matrix @ laplacian_matrix @ sqrt_degree_matrix


class ClusterFilter:
    """Filter out low-quality clusters."""

    def __init__(self, area_based: bool = False, overlapping_based: bool = False):
        self.area_based = area_based
        self.overlapping_based = overlapping_based

    def overlapping_based_filter(self):
        """
        Merge overlapping AoIs together.
        :return:
        """
        pass

    def area_based_filter(self):
        """
        Filter out small AoIs.
        :return:
        """
        pass
