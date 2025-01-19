import base64
import datetime
import os.path
from io import BytesIO

import numpy as np
import skimage
from skimage.filters import threshold_otsu


def b64_to_image(b64_string: str, as_gray=True):
    """Convert a base64 string to image in grey scale.

    :param b64_string: The base64 string.
    :param as_gray: Whether the image is parsed as gray-scale or not.
    :returns: An image in grey scale, represented by np.ndarray.
    """
    im_bytes = base64.b64decode(b64_string)  # im_bytes is a binary image
    im_file = BytesIO(im_bytes)  # convert image to file-like object
    return skimage.io.imread(im_file, as_gray=as_gray)


def remove_black_margin(screenshot):
    """
    Remove the black borders of the given screenshot.
    :param screenshot: Gray scale image.
    :return: the same screenshot with black borders replaced by white borders.
    """
    h, w = screenshot.shape
    white = screenshot.max()
    thred = threshold_otsu(screenshot)

    # get columns
    not_black_col = np.argwhere(screenshot[h // 2, :] >= thred)
    if not_black_col.shape[0] != 0:
        left = not_black_col.min()
        right = not_black_col.max()
        cols = np.concatenate((np.arange(left), np.arange(right + 1, w)))
        screenshot[:, cols] = white

    # get rows
    not_black_row = np.argwhere(np.all(screenshot >= thred, axis=1))
    if not_black_row.shape[0] != 0:
        top = not_black_row.min()
        bottom = not_black_row.max()
        rows = np.concatenate((np.arange(top), np.arange(bottom + 1, h)))
        screenshot[rows] = white
    return screenshot


def calculate_padding(screenshot_shape: tuple, padding_info: dict):
    """
    Calculate the padding for the given screenshot and padding_info
    :param screenshot_shape: [H, W, C] np.ndarray.
    :param padding_info: Including fields:
        top: margin for the iframe element;
        availableWidth/availableHeight: Width/height of the iframe
    :return: A tuple specifies the padding shapes.
    """
    aspect_ratio = screenshot_shape[1] / screenshot_shape[0]  # r = w / h
    iframe_ratio = float(padding_info["availableWidth"]) / float(padding_info["availableHeight"])
    top = int(padding_info["top"])
    x_offset = 0
    y_offset = 0
    if aspect_ratio > iframe_ratio:
        # width is larger and will be satisfied.
        y_offset = round(
            (float(padding_info["availableHeight"]) - float(padding_info["availableWidth"]) / aspect_ratio) / 2
        )
    else:
        # height is larger and will be satisfied.
        x_offset = round(
            (float(padding_info["availableWidth"]) - float(padding_info["availableHeight"]) * aspect_ratio) / 2
        )
    return (
        (top + y_offset, 0), (x_offset, x_offset)
    )


def save_screenshot(screenshot, root_dir, slide_id):
    """
    Save the screenshot on drive.
    :param screenshot: The screenshot. A numpy array as images are numpy arrays in skimage.
    :param root_dir: The root folder to save the screenshot.
    :param slide_id: The sequence number of the screenshot.
    :return:
    """
    current_time = datetime.datetime.now().strftime("%Y-%m-%d")
    root_dir = os.path.join(root_dir, "slides", current_time)

    if not os.path.exists(root_dir):
        os.makedirs(root_dir)
    filename = os.path.join(root_dir, f"{slide_id}.png")
    skimage.io.imsave(filename, screenshot)


def save_facial_expression(b64string, dirname, filename):
    """
    Save the facial expression of the student on drive.
    :param b64string: The base64 encoded image. A string.
    :param dirname: The folder to save the screenshot.
    :param filename: The filename of the facial expression.
    :return:
    """
    if not os.path.exists(dirname):
        os.makedirs(dirname)
    filename = os.path.join(dirname, f"{filename}.png")

    im_bytes = base64.b64decode(b64string)  # im_bytes is a binary image
    # im_file = BytesIO(im_bytes)  # convert image to file-like object

    with open(filename, "wb") as f:
        f.write(im_bytes)

