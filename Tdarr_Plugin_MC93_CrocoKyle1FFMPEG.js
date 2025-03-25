/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
  id: 'Tdarr_Plugin_MC93_CrocoKyle1FFMPEG',
  Stage: 'Pre-processing',
  Name: 'CrocoKyles Transcode via Nvidia GPU',
  Type: 'Video',
  Operation: 'Transcode',
  Description: `Files not in HEVC will be transcoded to HEVC using an Nvidia GPU through ffmpeg.
                All files not in the target quality profile will either be upscaled or downscaled to fit this resolution.
                The output bitrate will target an appropriate bitrate for the chosen quality profile, however, the bitrate 
                settings provided will override this behavior.
                This is a rewrite of Migz Transcode Using Nvidia GPU & FFMPEG.`,
  Version: '1.0.1',
  Tags: 'pre-processing,ffmpeg,video only,nvenc h265,configurable',
  Inputs: [
    {
      name: 'quality',
      type: 'string',
      defaultValue: '1080p @ 4500 kbps',
      inputUI: {
        type: 'dropdown',
        options: [
          '360p @ 500 kbps',
          '480p @ 1200 kbps',
          '720p @ 1500 kbps',
          '720p @ 3000 kbps',
          '1080p @ 3000 kbps',
          '1080p @ 4500 kbps',
          '2k @ 6000 kbps',
          '2k @ 9000 kbps',
          '4k @ 13000 kbps',
          '4k @ 20000 kbps',
        ],
      },
      tooltip: `Specify the target output resolution. Videos using a source aspect ratio other than 16:9 will be 
                scaled to the corresponding vertical height and maintain their aspect ratio. Note that this bitrate
                can be overriden by the bitrate settings below.`
    },
    {
      name: 'container',
      type: 'string',
      defaultValue: 'mkv',
      inputUI: {
        type: 'dropdown',
        options: [
          'mkv',
          'mp4',
          'avi',
          'webm',
          'mov',
          'flv',
          'ts',
          'ogg',
          'asf',
          'original',
        ],
      },
      tooltip: `Specify output container of file. Use 'original' to keep original container.
                \\n Ensure that all stream types you may have are supported by your chosen container.
                \\n mkv is recommended.
                    \\nExample:\\n
                    mkv

                    \\nExample:\\n
                    mp4
                    
                    \\nExample:\\n
                    original`,
    },
    {
      name: 'bitrate_scaledown_factor',
      type: 'string',
      defaultValue: '1',
      inputUI: {
        type: 'text',
      },
      tooltip: `Scales down the bitrate for each resolution by the factor specified. This value is ignored when exceeding bitrate_ceiling.
                
                \\n Example:
                \\n If using a resolution of 1080p, with this value set to 2, the default bitrate for 1080p is 4500 kpbs. The output bitrate will be half or 2250 kbps.`,
    },
    {
      name: 'bitrate_floor',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify the absolute lowest output bitrate. Files will not be transcoded to a lower bitrate. Must be set lower than bitrate_ceiling. This setting can increase file size.
               \\n Rate is in kbps.
               \\n Leave empty to disable (Recommended).
                    \\nExample:\\n
                    If using a resolution of 480p, with this value set to 3000, the default bitrate for 480p is 1000 kpbs. The output bitrate will be 3000 kbps.`,
    },
    {
      name: 'bitrate_ceiling',
      type: 'string',
      defaultValue: '20000',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify the absolute highest output bitrate. Files with a lower target bitrate will target this value. Must be set higher than bitrate_floor. 
               \\n Rate is in kbps.
               \\n Leave empty to disable.
                    \\nExample:\\n
                    If using a resolution of 4k, with this value set to 8000, the default bitrate for 4k is 20000 kpbs. The output bitrate will be 8000 kbps.`,
    },
    {
      name: 'enable_10bit',
      type: 'boolean',
      defaultValue: false,
      inputUI: {
        type: 'dropdown',
        options: [
          'false',
          'true',
        ],
      },
      tooltip: `Specify if output file should be 10bit. Default is false.
                    \\nExample:\\n
                    true

                    \\nExample:\\n
                    false`,
    },
    {
      name: 'enable_bframes',
      type: 'boolean',
      defaultValue: false,
      inputUI: {
        type: 'dropdown',
        options: [
          'false',
          'true',
        ],
      },
      tooltip: `Specify if b frames should be used.
                 \\n Using B frames should decrease file sizes but are only supported on newer GPUs.
                 \\n Default is false.
                    \\nExample:\\n
                    true

                    \\nExample:\\n
                    false`,
    },
  ],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
  const lib = require('../methods/lib')();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  inputs = lib.loadDefaultValues(inputs, details);
  const response = {
    processFile: false,
    preset: '',
    handBrakeMode: false,
    FFmpegMode: true,
    reQueueAfter: true,
    infoLog: '',
  };

  let duration = '';

  // Check if inputs.container has been configured. If it hasn't then exit plugin.
  if (inputs.container === '') {
    response.infoLog += 'Plugin has not been configured, please configure required options. Skipping this plugin. \n';
    response.processFile = false;
    return response;
  }

  if (inputs.container === 'original') {
    // eslint-disable-next-line no-param-reassign
    inputs.container = `${file.container}`;
    response.container = `.${file.container}`;
  } else {
    response.container = `.${inputs.container}`;
  }

  // Check if file is a video. If it isn't then exit plugin.
  if (file.fileMedium !== 'video') {
    response.processFile = false;
    response.infoLog += 'File is not a video. \n';
    return response;
  }

  // Check if duration info is filled, if so times it by 0.0166667 to get time in minutes.
  // If not filled then get duration of stream 0 and do the same.
  if (parseFloat(file.ffProbeData?.format?.duration) > 0) {
    duration = parseFloat(file.ffProbeData?.format?.duration) * 0.0166667;
  } else if (typeof file.meta.Duration !== 'undefined') {
    duration = file.meta.Duration * 0.0166667;
  } else {
    duration = file.ffProbeData.streams[0].duration * 0.0166667;
  }

  // Quality profiles map the option to standard 16:9 resolutions and their respective bitrate.
  // Aspect ratios are not hardcoded, but these are used to determine whether a video matches the target profile.
  const quality_profiles = {
    '360p @ 500 kbps': [360, 500],
    '480p @ 1200 kbps': [480, 720, 1200],
    '720p @ 1500 kbps': [720, 1280, 1500],
    '720p @ 3000 kbps': [720, 1280, 3000],
    '1080p @ 3000 kbps': [1080, 1920, 3000],
    '1080p @ 4500 kbps': [1080, 1920, 4500],
    '2k @ 6000 kbps': [1440, 2560, 6000],
    '2k @ 9000 kbps': [1440, 2560, 9000],
    '4k @ 13000 kbps': [2160, 3840, 13000],
    '4k @ 20000 kbps': [2160, 3840, 20000],
  }
  const [chosen_height, chosen_width, chosen_bitrate] = quality_profiles[inputs.quality];
  let videoIdx = 0;
  let CPU10 = false;
  let extraArguments = `-vf scale=-1:${chosen_height} `;
  let genpts = '';

  let bitrate_floor = Number(inputs.bitrate_floor);
  let bitrate_ceiling = Number(inputs.bitrate_ceiling);

  if (bitrate_ceiling <= bitrate_floor) {
    response.infoLog += 'bitrate_ceiling must be greater than the bitrate_floor.';
    return response;
  }
  if (inputs.bitrate_scaledown_factor < 1) {
    response.infoLog += 'bitrate_scaledown_factor must be greater than 1.';
    return response;
  }

  // Bitrate calculations
  let bitrateSettings = '';
  // Work out currentBitrate using "Bitrate = file size / (number of minutes * .0075)"
  // Used from here https://blog.frame.io/2017/03/06/calculate-video-bitrates/
  // eslint-disable-next-line no-bitwise
  const currentBitrate = ~~(file.file_size / (duration * 0.0075));
  // Use the same calculation used for currentBitrate but divide it in half to get targetBitrate.
  // Logic of h265 can be half the bitrate as h264 without losing quality.
  // eslint-disable-next-line no-bitwise

  var targetBitrate = ~~(chosen_bitrate / Number(inputs.bitrate_scaledown_factor));

  // Lower the bitrate to the ceiling
  if (inputs.bitrate_ceiling !== '') {
    if (targetBitrate > bitrate_ceiling) {
      response.infoLog += `Proposed bitrate ${targetBitrate} kbps exceeds ceiling. Limiting to ${bitrate_ceiling} kbps.\n`;
      targetBitrate = bitrate_ceiling;
    }
  }

  // Raise the bitrate to the floor
  if (inputs.bitrate_ceiling !== '') {
    if (targetBitrate < bitrate_floor) {
      response.infoLog += `Proposed bitrate ${targetBitrate} kbps is lower than the floor. Raising to ${bitrate_floor} kbps.\n`;
      targetBitrate = bitrate_floor;
    }
  }

  // Don't ever exceed the existing bitrate
  if (targetBitrate > currentBitrate) { targetBitrate = currentBitrate }

  // Allow some leeway under and over the targetBitrate for action-packed scenes.
  // eslint-disable-next-line no-bitwise
  const minimumBitrate = ~~(targetBitrate * 0.7);
  // eslint-disable-next-line no-bitwise
  const maximumBitrate = ~~(targetBitrate * 1.3);

  // If Container .ts or .avi set genpts to fix unknown timestamp
  if (inputs.container.toLowerCase() === 'ts' || inputs.container.toLowerCase() === 'avi') {
    genpts = '-fflags +genpts';
  }

  // If targetBitrate comes out as 0 then something has gone wrong and bitrates could not be calculated.
  // Cancel plugin completely.
  if (targetBitrate === 0) {
    response.processFile = false;
    response.infoLog += 'Target bitrate could not be calculated. Skipping this plugin. \n';
    return response;
  }

  // Check streams and add any extra parameters required to make file conform with output format.
  if (inputs.container.toLowerCase() === 'mkv') {
    extraArguments += '-map -0:d ';
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        if (
            file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'mov_text'
            || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'eia_608'
            || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'timed_id3'
        ) {
          extraArguments += `-map -0:${i} `;
        }
      } catch (err) {
        // Error
      }
    }
  }
  if (inputs.container.toLowerCase() === 'mp4') {
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        if (
            file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'hdmv_pgs_subtitle'
            || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'eia_608'
            || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'subrip'
            || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'timed_id3'
        ) {
          extraArguments += `-map -0:${i} `;
        }
      } catch (err) {
        // Error
      }
    }
  }

  // Check if 10bit variable is true.
  if (inputs.enable_10bit === true) {
    // If set to true then add 10bit argument
    extraArguments += '-pix_fmt p010le ';
  }

  // Check if b frame variable is true.
  if (inputs.enable_bframes === true) {
    // If set to true then add b frames argument
    extraArguments += '-bf 5 ';
  }

  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    // Check if stream is a video.
    let codec_name = file.ffProbeData.streams[i].codec_name
    let height = file.ffProbeData.streams[i].height
    let width = file.ffProbeData.streams[i].width
    let codec_type = '';
    try {
      codec_type = file.ffProbeData.streams[i].codec_type.toLowerCase();
    } catch (err) {
      // err
    }
    if (codec_type === 'video') {

      // Check if codec of stream is mjpeg/png, if so then remove this "video" stream.
      // mjpeg/png are usually embedded pictures that can cause havoc with plugins.
      if (codec_name === 'mjpeg' || codec_name === 'png') {
        extraArguments += `-map -v:${videoIdx} `;
      }
      response.infoLog += `========== Source Details: ==========\n`;
      response.infoLog += `Height: ${height} px\n`;
      response.infoLog += `Width: ${width} px\n`;
      response.infoLog += `Codec: ${codec_name}\n`;
      response.infoLog += `Bitrate: ${currentBitrate} kbps \n`;
      response.infoLog += `===============================\n`;

      function generateConditionLog(condition, description) {
        return `  ${condition ? '✅' : '❌'} ${description}\n`;
      }

      // Success Conditions
      let codec_match = codec_name === 'hevc'
      let container_match = file.container === inputs.container;
      let resolution_match = width <= chosen_width && height <= chosen_height
      let bitrate_match = (currentBitrate <= chosen_bitrate * 1.1)
      let bitrate_ceiling_match = currentBitrate <= bitrate_ceiling
      let bitrate_floor_match = currentBitrate >= bitrate_floor

      let conditions = [
        { condition: codec_match, description: 'Codec is HEVC' },
        { condition: container_match, description: `Container is ${inputs.container}` },
        { condition: resolution_match, description: `Resolution is ${inputs.quality.split('@')[0].trim()}`},
        { condition: bitrate_match, description: `Bitrate is <= ${chosen_bitrate * 1.1} kbps` },
        { condition: bitrate_ceiling_match, description: 'Bitrate is lower than the specified ceiling' },
        { condition: bitrate_floor_match, description: 'Bitrate is higher than the specified floor' },
      ];

      let allConditionsMet = conditions.every(item => item.condition);

      if (allConditionsMet) {
        response.processFile = false;
        response.infoLog += `Success conditions have all been met. Skipping transcoding for this file...\n`;
      } else {
        response.infoLog += `Success conditions have not been met yet. Transcoding...\n`;
      }

      conditions.forEach(item => {
        response.infoLog += generateConditionLog(item.condition, item.description);
      });

      // Check if video stream is HDR or 10bit
      if (
          file.ffProbeData.streams[i].profile === 'High 10'
          || file.ffProbeData.streams[i].bits_per_raw_sample === '10'
      ) {
        CPU10 = true;
      }

      // Increment videoIdx.
      videoIdx += 1;
    }
  }

  // Set bitrateSettings variable using bitrate information calulcated earlier.
  bitrateSettings = `-b:v ${targetBitrate}k -minrate ${minimumBitrate}k `
      + `-maxrate ${maximumBitrate}k -bufsize ${currentBitrate}k`;
  // `-b:v ${targetBitrate}k -minrate ${minimumBitrate}k `
  // + `-maxrate ${maximumBitrate}k -bufsize ${currentBitrate}k`;

  // Print to infoLog information around file & bitrate settings.
  response.infoLog += `======== Output Bitrate Details: ========\n`;
  response.infoLog += `Ceiling (Average): ${bitrate_ceiling} kbps \n`;
  response.infoLog += `Maximum (Any given time): ${maximumBitrate} kbps \n`;
  response.infoLog += `Chosen: ${chosen_bitrate} kbps \n`;
  response.infoLog += `Target: ${targetBitrate} kbps \n`;
  response.infoLog += `Minimum (Any given time): ${minimumBitrate} kbps \n`;
  response.infoLog += `Floor (Average): ${bitrate_floor} kbps \n`;
  response.infoLog += `===============================\n`;

  // Codec will be checked so it can be transcoded correctly
  if (file.video_codec_name === 'h263') {
    response.preset = '-c:v h263_cuvid';
  } else if (file.video_codec_name === 'h264') {
    if (CPU10 === false) {
      response.preset = '-c:v h264_cuvid';
    }
  } else if (file.video_codec_name === 'mjpeg') {
    response.preset = '-c:v mjpeg_cuvid';
  } else if (file.video_codec_name === 'mpeg1') {
    response.preset = '-c:v mpeg1_cuvid';
  } else if (file.video_codec_name === 'mpeg2') {
    response.preset = '-c:v mpeg2_cuvid';
  } else if (file.video_codec_name === 'mpeg4') {
    response.preset = '-c:v mpeg4_cuvid';
  } else if (file.video_codec_name === 'vc1') {
    response.preset = '-c:v vc1_cuvid';
  } else if (file.video_codec_name === 'vp8') {
    response.preset = '-c:v vp8_cuvid';
  }

  response.preset += `${genpts}, -map 0 -c:v hevc_nvenc -cq:v 19 ${bitrateSettings} `
      + `-spatial_aq:v 1 -rc-lookahead:v 32 -c:a copy -c:s copy -max_muxing_queue_size 9999 ${extraArguments}`;
  response.processFile = true;

  return response;
};
module.exports.details = details;
module.exports.plugin = plugin;