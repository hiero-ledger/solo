node_id=$1
isToClean=$2
export MALLOC_ARENA_MAX=4

APP_HOME=/opt/hgcapp/services-hedera/HapiApp2.0

if [ "$isToClean" = "clean" ]
then
  echo "Cleaning old data ..."

  cd $APP_HOME
  rm -rf data/saved/*
  rm -rf /opt/hgcapp/*Streams/* /opt/hgcapp/accountBalances/*
  rm -rf output/*
  rm -rf output/*/*
  rm -rf data/stats/*
  rm -rf data/block-streams
  cp .archive/config.txt config.txt
  rm -rf .archive
  #cd $APP_HOME/data/keys
  #bash generate.sh node1
fi

LANG=C.utf8
JAVA_CLASS_PATH=data/lib/*:data/apps/*
JAVA_OPTS="-XX:MaxDirectMemorySize=1500m --add-opens java.base/jdk.internal.misc=ALL-UNNAMED --add-opens java.base/java.nio=ALL-UNNAMED -Dio.netty.tryReflectionSetAccessible=true"
JAVA_HOME=/usr/local/java
USER=hedera
HOME=/home/hedera
JAVA_HEAP_MIN=5g
JAVA_HEAP_MAX=6g
JAVA_HEAP_OPTS="-Xms${JAVA_HEAP_MIN} -Xmx${JAVA_HEAP_MAX} -XX:+UseG1GC"
JAVA_MAIN_CLASS=com.hedera.node.app.ServicesMain
LOGNAME=hedera
PATH=/usr/local/java/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

cd $APP_HOME
nohup /usr/bin/env java ${JAVA_HEAP_OPTS} ${JAVA_OPTS} -cp "${JAVA_CLASS_PATH}" "${JAVA_MAIN_CLASS}" -local ${node_id} > node.log 2>&1 &

echo "startPodJava.sh ${node_id} ${isToClean} run completed."