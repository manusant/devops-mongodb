Configure a MongoDB Replica Set on Kubernetes using Satefulset and PersistentVolumeClaim.
> To set up the MongoDB replica set, you need three things: A StorageClass, a Headless Service, and a StatefulSet.

## 1. Setting up the StorageClass
The storage class tells Kubernetes what kind of storage to use for the database nodes.

In this project we want to configure storage in SSD drives.

The configuration for the StorageClass for Google Cloud Provider looks like his:
```
kind: StorageClass
apiVersion: storage.k8s.io/v1beta1
metadata:
  name: fast
provisioner: kubernetes.io/gce-pd
parameters:
  type: pd-ssd
```

The configuration for the StorageClass for Scaleway Provider looks like his:
```
kind: StorageClass
apiVersion: storage.k8s.io/v1beta1
metadata:
  name: fast
provisioner: csi.scaleway.com
parameters:
  type: scw-bssd
```
This configuration creates a new StorageClass called "fast" that is backed by SSD volumes. The StatefulSet can now request a volume, and the StorageClass will automatically create it.

### Deploy this StorageClass:
```
$ kubectl apply -f storageclass_ssd.yaml
```
> In this project we will use Scaleway that brings the <b>scw-bssd</b> configured as default, so we will just use it (We dont need to create a storage class for SSD).
 
## 2. Deploying the Headless Service and StatefulSet
### Headless Service
```
apiVersion: v1
kind: Service
metadata:
 name: mongo
 labels:
   name: mongo
spec:
 ports:
 - port: 27017
   targetPort: 27017
 clusterIP: None
 selector:
   role: mongo
``` 
You can tell this is a Headless Service because the clusterIP is set to "None." When combined with StatefulSets, they can give you unique DNS addresses that let you directly access the pods. This is perfect for creating MongoDB replica sets, because our app needs to connect to all of the MongoDB nodes individually.

### StatefulSet
```
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
spec:
  serviceName: mongo
  replicas: 3
  selector:
    matchLabels:
      role: mongo
      environment: test
      replicaset: rs0
  template:
    metadata:
      labels:
        role: mongo
        environment: test
        replicaset: rs0
    spec:
      terminationGracePeriodSeconds: 10
      containers:
        - name: mongo
          image: mongo
          command:
            - mongod
            - "--replSet"
            - rs0
            - "--bind_ip"
            - "0.0.0.0"
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: mongo-persistent-storage
              mountPath: /data/db
  volumeClaimTemplates:
    - metadata:
        name: mongo-persistent-storage
        annotations:
          volume.beta.kubernetes.io/storage-class: "scw-bssd"
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 50Gi
```

The first second describes the StatefulSet object. Then, we move into the Metadata section, where you can specify labels and the number of replicas.

Next comes the pod spec. The terminationGracePeriodSeconds is used to gracefully shutdown the pod when you scale down the number of replicas, which is important for databases! Then the configurations for the container is shown. The container runs MongoDB with command line flags that configure the replica set name. It also mounts the persistent storage volume to /data/db, the location where MongoDB saves its data.

Finally, there is the volumeClaimTemplates. This is what talks to the StorageClass we created before to provision the volume. It will provision a 100 GB disk for each MongoDB replica.

We can deploy both the Headless Service and the StatefulSet with this command:
```
$ kubectl apply -f mongo-statefulset.yaml
```

## 3. Wait for Kubernetes Pod running and PVC
```
$ kubectl get all
NAME          READY   STATUS    RESTARTS   AGE
pod/mongo-0   1/1     Running   0          38h
pod/mongo-1   1/1     Running   0          38h
pod/mongo-2   1/1     Running   0          38h


NAME                 TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)     AGE
service/kubernetes   ClusterIP   10.32.0.1    <none>        443/TCP     2d22h
service/mongo        ClusterIP   None         <none>        27017/TCP   38h
```

```
$ kubectl get pvc
NAME                               STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
mongo-persistent-storage-mongo-0   Bound    pvc-815d768b-247a-4bd7-a477-f28bf8cd3bda   50Gi       RWO            scw-bssd       39h
mongo-persistent-storage-mongo-1   Bound    pvc-50cb7382-4e74-43c4-894b-b9b3a2910a86   50Gi       RWO            scw-bssd       39h
mongo-persistent-storage-mongo-2   Bound    pvc-7dc3213e-6345-4aa0-9c02-0902acc05f6d   50Gi       RWO            scw-bssd       39h
```

## 4. Setup ReplicaSet Configuration
Finally, we need to connect to one of the “mongod” container processes to configure the replica set.

Run the following command to connect to the first container. In the shell initiate the replica set (we can rely on the hostnames always being the same, due to having employed a StatefulSet):

``` bash
$ kubectl exec -ti mongo-0 mongo

> rs.initiate({_id: "rs0", version: 1, members: [
       { _id: 0, host : "mongo-0.mongo:27017" },
       { _id: 1, host : "mongo-1.mongo:27017" },
       { _id: 2, host : "mongo-2.mongo:27017" }
 ]});
```

Keep checking the status of the replica set, with the following command, until the replica set is fully initialised and a primary and two secondaries are present:

``` bash
> rs.status();

# Possible result would be:
{
	"set" : "rs0",
	"date" : ISODate("2019-11-03T19:19:09.555Z"),
	"myState" : 2,
	"term" : NumberLong(1),
	"syncingTo" : "mongo-2.mongo:27017",
	"syncSourceHost" : "mongo-2.mongo:27017",
	"syncSourceId" : 2,
	"heartbeatIntervalMillis" : NumberLong(2000),
	"majorityVoteCount" : 2,
	"writeMajorityCount" : 2,
	"optimes" : {
		"lastCommittedOpTime" : {
			"ts" : Timestamp(1572808748, 1),
			"t" : NumberLong(1)
		},
		"lastCommittedWallTime" : ISODate("2019-11-03T19:19:08.412Z"),
		"readConcernMajorityOpTime" : {
			"ts" : Timestamp(1572808748, 1),
			"t" : NumberLong(1)
		},
		"readConcernMajorityWallTime" : ISODate("2019-11-03T19:19:08.412Z"),
		"appliedOpTime" : {
			"ts" : Timestamp(1572808748, 1),
			"t" : NumberLong(1)
		},
		"durableOpTime" : {
			"ts" : Timestamp(1572808748, 1),
			"t" : NumberLong(1)
		},
		"lastAppliedWallTime" : ISODate("2019-11-03T19:19:08.412Z"),
		"lastDurableWallTime" : ISODate("2019-11-03T19:19:08.412Z")
	},
	"lastStableRecoveryTimestamp" : Timestamp(1572808708, 1),
	"lastStableCheckpointTimestamp" : Timestamp(1572808708, 1),
	"members" : [
		{
			"_id" : 0,
			"name" : "mongo-0.mongo:27017",
			"ip" : "100.65.67.165",
			"health" : 1,
			"state" : 2,
			"stateStr" : "SECONDARY",
			"uptime" : 140796,
			"optime" : {
				"ts" : Timestamp(1572808748, 1),
				"t" : NumberLong(1)
			},
			"optimeDate" : ISODate("2019-11-03T19:19:08Z"),
			"syncingTo" : "mongo-2.mongo:27017",
			"syncSourceHost" : "mongo-2.mongo:27017",
			"syncSourceId" : 2,
			"infoMessage" : "",
			"configVersion" : 1,
			"self" : true,
			"lastHeartbeatMessage" : ""
		},
		{
			"_id" : 1,
			"name" : "mongo-1.mongo:27017",
			"ip" : "100.65.67.166",
			"health" : 1,
			"state" : 2,
			"stateStr" : "SECONDARY",
			"uptime" : 140642,
			"optime" : {
				"ts" : Timestamp(1572808738, 1),
				"t" : NumberLong(1)
			},
			"optimeDurable" : {
				"ts" : Timestamp(1572808738, 1),
				"t" : NumberLong(1)
			},
			"optimeDate" : ISODate("2019-11-03T19:18:58Z"),
			"optimeDurableDate" : ISODate("2019-11-03T19:18:58Z"),
			"lastHeartbeat" : ISODate("2019-11-03T19:19:07.699Z"),
			"lastHeartbeatRecv" : ISODate("2019-11-03T19:19:07.698Z"),
			"pingMs" : NumberLong(0),
			"lastHeartbeatMessage" : "",
			"syncingTo" : "mongo-2.mongo:27017",
			"syncSourceHost" : "mongo-2.mongo:27017",
			"syncSourceId" : 2,
			"infoMessage" : "",
			"configVersion" : 1
		},
		{
			"_id" : 2,
			"name" : "mongo-2.mongo:27017",
			"ip" : "100.65.67.167",
			"health" : 1,
			"state" : 1,
			"stateStr" : "PRIMARY",
			"uptime" : 140642,
			"optime" : {
				"ts" : Timestamp(1572808738, 1),
				"t" : NumberLong(1)
			},
			"optimeDurable" : {
				"ts" : Timestamp(1572808738, 1),
				"t" : NumberLong(1)
			},
			"optimeDate" : ISODate("2019-11-03T19:18:58Z"),
			"optimeDurableDate" : ISODate("2019-11-03T19:18:58Z"),
			"lastHeartbeat" : ISODate("2019-11-03T19:19:07.698Z"),
			"lastHeartbeatRecv" : ISODate("2019-11-03T19:19:08.020Z"),
			"pingMs" : NumberLong(0),
			"lastHeartbeatMessage" : "",
			"syncingTo" : "",
			"syncSourceHost" : "",
			"syncSourceId" : -1,
			"infoMessage" : "",
			"electionTime" : Timestamp(1572668118, 1),
			"electionDate" : ISODate("2019-11-02T04:15:18Z"),
			"configVersion" : 1
		}
	],
	"ok" : 1,
	"$clusterTime" : {
		"clusterTime" : Timestamp(1572808748, 1),
		"signature" : {
			"hash" : BinData(0,"AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
			"keyId" : NumberLong(0)
		}
	},
	"operationTime" : Timestamp(1572808748, 1)
}
```

## 5. create admin user
```bash
$ kubectl exec -ti mongo-0 mongo
> db.getSiblingDB("admin").createUser({
       user : "{{user-name-here}}",
       pwd  : "{{user-password-here}}",
       roles: [ { role: "root", db: "admin" } ]
  });
``` 

## 6. Enable slave on secondary replicas
```bash
$ kubectl exec -ti mongo-1 mongo
> db.getSiblingDB('admin').auth("{{user-name-here}}", "{{user-password-here}}");
> db.getMongo().setSlaveOk()
```

## 7. Create an admin user for your databases
Just run the  <b>set_dbs.js</b> against the primary database on the replicaset.

## 8. Verify Cluster Data
exec into a Secondary Pod (here, mongo-1)
```bash
$ kubectl exec -ti mongo-1 mongo
> db.getSiblingDB('admin').auth("{{user-name-here}}", "{{user-password-here}}");
> db.getMongo().setSlaveOk()
> use test;
> db.testcoll.find();
```
## 9. Verify PVC
```bash
$ kubectl delete -f mongo-statefulset.yaml
$ kubectl get all
$ kubectl get persistentvolumes
```
Recreate MongoDB
```
$ kubectl apply -f mongo-statefulset.yaml
$ kubectl get all
```
Verify Data:
```
kubectl exec -ti mongo-0 mongo
> db.getSiblingDB('admin').auth("main_admin", "abc123");
> use test;
> db.testcoll.find();
```
> As PVC was not deleted, We will still have existing Data.

## 10. Verify Clusterization
Delete **mongod-0** Pod and keep cheking **rs.status()**, eventually another node of the remaining two will become Primary Node.


## 11. Connect to mongodb from outside of kubernetes
List the replicaset services:
```
$ kubectl get services
``` 
Do a Prot-forward
```
$ kubectl port-forward svc/mongo 27018:27017
```
Where **mongo** is the mongodb service name and **27018** is your local port.
 

> As best practice, you should always connect on services not on pods. Since pods are automatically recreated/restarted, it will give you a new pod name. Connecting to a service saves you from reconnecting and finding the primary pod of your mongodb replicaset.

## 12. Connect services to the Mongo Replica Set
Each pod in a StatefulSet backed by a Headless Service will have a stable DNS name. The template follows this format: **<pod-name>.<service-name>**

This means the DNS names for the MongoDB replica set are:
```
mongo-0.mongo
mongo-1.mongo
mongo-2.mongo
```

You can use these names directly in the connection string URI of your app.

In this case, the connection string URI would be:
```
"mongodb://mongo-0.mongo,mongo-1.mongo,mongo-2.mongo:27017/dbname_?"
```

## 13. Backup database data to a local folder
```
$ mongodump --host=localhost --port=27017 --out=/Users/mbs/backup/mongo/backups
```
## 14. Restore a the database from a backup folder
```
$ mongorestore --host=localhost --port=27018 /Users/mbs/backup/mongo/backups
```

## 15. Reconfigure replicaset (In case of errors in one of the members)
[Documentation](https://docs.mongodb.com/manual/tutorial/reconfigure-replica-set-with-unavailable-members/)

```
$ kubectl exec -ti mongo-0 mongo
> cfg = rs.conf()
> rs.reconfig(cfg, {force : true})
```

> This procedure lets you recover while a majority of replica set members are down or unreachable. You connect to any surviving member and use the force option to the rs.reconfig() method.

> The force option forces a new configuration onto the member. Use this procedure only to recover from catastrophic interruptions. Do not use force every time you reconfigure. Also, do not use the force option in any automatic scripts and do not use force when there is still a primary.

## 16. Proxy MongoDB to a local port
```
kubectl port-forward mongo-0 27019:27017
```
