var axios = require('axios')

const API_URL = 'https://www.easports.com/iframe/fifa17proclubs/api/platforms'
const API_PLATFORM = 'PS4'

function * values (obj) {
  for (let prop of Object.keys(obj)) { yield obj[prop] }
}

exports.get = async function (endpoint, platform) {
  try {
    const response = await axios.get(`${API_URL}/${platform || API_PLATFORM}/${endpoint}`)
    // return Array.from(values(response.data.raw))[0]

    return response.data.raw
    
  } catch (e) {
    throw Error(e)
  }
}
