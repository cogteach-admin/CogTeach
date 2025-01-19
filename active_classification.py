from sklearn.cluster import AgglomerativeClustering, Birch
from sklearn.svm import OneClassSVM
from sklearn.metrics import f1_score
from queue import Queue
import numpy as np
import random
import threading
import time

dataBuffer = Queue()
current_ensemble = [[], []]
threshold = 0.8

TEST = True

def ensemble_predict(sample):
    sample = np.expand_dims(sample, axis=0)
    result = []
    for ensemble in range(current_ensemble):
        if ensemble == []:
            return None
        total = len(model)
        positive = 0
        for model in ensemble:
            res = model.predict(sample)[0]
            positive += 1 if res == 1 else 0
        result.append(positive/total)
    max_p = max(result)
    result_list = [i for i, j in enumerate(result) if j == max_p]
    return result_list


class GazeDataThread(threading.Thread):
    def __init__(self, tID, size):
        threading.Thread.__init__(self)
        self.threadID = tID
        self.size = size

    def run(self):
        print("GazeDataThread. Starting at {}, size: {}".format(
            time.time(), self.size))
        while True:
            if TEST:
                if np.random.random_sample() >= 0.5:
                    l, h = 0, 1
                else:
                    l, h = -5, 5
                # print('gen new data')
                sample = np.random.uniform(l, h, self.size)
                # print('new sample added')
                dataBuffer.put(sample)
                time.sleep(2)
                # print('after sleep')
            else:
                #TODO: here add communication with client side
                pass
        try:
            pass
        except KeyboardInterrupt as e:
            print("Ending program", e)
        except Exception as e:
            print(e)
        finally:
            print("GazeDataThread. Exiting at {}".format(time.time()))

class ClusterThread(threading.Thread):
    def __init__(self, tID, lb, ub, step):
        threading.Thread.__init__(self)
        self.threadID = tID
        self.lower_bound = lb
        self.upper_bound = ub
        self.step = step
        self.database = []
        self.newly_appended = []
        self.clustering = Birch(n_clusters=2)
        # self.clustering = AgglomerativeClustering() # input: n_sample x n_feature
    def run(self):
        try:
            while True:
                sample = dataBuffer.get()
                if self.upper_bound <= len(self.database):
                    res = ensemble_predict(sample)
                    if len(res) == 1:
                        print('classification result:', res[0])
                    else:
                        print('classification result:', res, ', asking for clarification')
                        # TODO: update classifier when receiving the answer
                    continue
                self.database.append(sample)
                self.newly_appended.append(sample)
                print('Got data!', len(self.database))
                if len(self.newly_appended) == self.step:
                    print(len(self.database), 'data, clustering...')
                    # start clustering...
                    self.clustering.partial_fit(np.array(self.newly_appended))
                    labels = self.clustering.predict(np.array(self.database))
                    cluster = {'osvm':[None, None], 'data':[[], []], 'f1':[0,0]}
                    for i in range(len(labels)):
                        cluster['data'][labels[i]].append(self.database[i])
                    cluster['osvm'][0] = OneClassSVM(
                        gamma='auto').fit(cluster['data'][0])
                    y_pred = cluster['osvm'][0].predict(self.database)
                    y_true = labels.copy()
                    y_true[y_true == 1] = -1
                    y_true[y_true == 0] = 1
                    cluster['f1'][0] = f1_score(y_true, y_pred)
                    cluster['osvm'][1] = OneClassSVM(
                        gamma='auto').fit(cluster['data'][1])
                    y_pred = cluster['osvm'][1].predict(self.database)
                    y_true = labels.copy()
                    y_true[y_true == 0] = -1
                    cluster['f1'][1] = f1_score(y_true, y_pred)
                    print(
                        'clf0-f1: {}, clf1-f1: {}'.format(cluster['f1'][0], cluster['f1'][1]))
                    if cluster['f1'][0] > threshold:
                        current_ensemble[0].append(cluster['osvm'][0])
                    if cluster['f1'][1] > threshold:
                        current_ensemble[1].append(cluster['osvm'][1])
                    print('classifiers added!', len(current_ensemble[0]), 'classifiers for cluster 0,', 
                        len(current_ensemble[1]), 'classifiers for cluster 1')
                    self.newly_appended = []
        except KeyboardInterrupt as e:
            print("Ending program", e)
        except Exception as e:
            print(e)
        finally:
            print("ClusterThread. Exiting at {}".format(time.time()))





gaze_th = GazeDataThread(0, 104)
# gaze_th.daemon = True
cluster_th = ClusterThread(1, 10, 500, 10)
# cluster_th.daemon = True

gaze_th.start()
cluster_th.start()












