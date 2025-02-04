const meanValues = {};

export const findMeanOfPowerTopicsNew = async (data) => {
  try {
    const { topic, message, date, userId } = data;

    const formattedDate = new Date(date).toLocaleDateString('en-GB');

    if (!meanValues[formattedDate]) {
      meanValues[formattedDate] = {};
    }

    if (!meanValues[formattedDate][userId]) {
      meanValues[formattedDate][userId] = {
        pv: [],
        load: []
      };
    }

    if (topic === 'solar_assistant_DEYE/total/pv_power/state') {
      meanValues[formattedDate][userId].pv.push(parseFloat(message));
    } else if (topic === 'solar_assistant_DEYE/total/load_power/state') {
      meanValues[formattedDate][userId].load.push(parseFloat(message));
    }

    const pvPowerMean = calculateMean(meanValues[formattedDate][userId].pv);
    const loadPowerMean = calculateMean(meanValues[formattedDate][userId].load);

    return {
      date: formattedDate,
      userId: userId,
      pv: pvPowerMean,
      load: loadPowerMean
    };

  } catch (error) {
    throw new Error('Error finding mean power values: ' + error);
  }
}

const calculateMean = (values) => {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + parseFloat(val), 0);
  return (sum / values.length / 100).toFixed(1);
}
