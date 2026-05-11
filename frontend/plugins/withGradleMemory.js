const { withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  'org.gradle.jvmargs':
    '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  'kotlin.daemon.jvmargs':
    '-Xmx3072m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.workers.max': '4',
  'org.gradle.parallel': 'false',
  'org.gradle.daemon': 'true',
  'org.gradle.configureondemand': 'false',
};

function upsert(properties, key, value) {
  const idx = properties.findIndex(
    (item) => item.type === 'property' && item.key === key
  );
  if (idx >= 0) {
    properties[idx].value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      upsert(cfg.modResults, key, value);
    }
    return cfg;
  });
};
