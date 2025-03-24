/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
  id: 'Tdarr_Plugin_MC93_CrocoKyle1FFMPEG',
  Stage: 'Pre-processing',
  Name: 'CrocoKyles Transcode via Nvidia GPU',
  Type: 'Video',
  Operation: 'Transcode',
  Description: `Files not in HVEC will be transcoded to HVEC using an Nvidia GPU through ffmpeg.
                  All files not in the target_resolution will either be upscaled or downscaled to fit this resolution.
                  This is a modified version of Migz Transcode Using Nvidia GPU & FFMPEG.`,
  Version: '1.0.0',
  Tags: 'pre-processing,ffmpeg,video only,nvenc h265,configurable',
  Inputs: [
    {
      name: 'target_resolution',
      type: 'string',
      defaultValue: '1080p',
      inputUI: {
        type: 'dropdown',
        options: [
          '480p',
          '720p',
          '1080p',
          '2k',
          '4k',
        ],
      },
      tooltip: `Specify the target output resolution. Videos using a source aspect ratio other than 16:9 will be 
                      scaled to the corresponding vertical height and maintain their aspect ratio.`
    },
    {
      name: 'container',
      type: 'string',
      defaultValue: 'mkv',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify output container of file. Use 'original' without quotes to keep original container.
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
      defaultValue: '2',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify the factor to scaledown the bitrate. This value is ignored when exceeding bitrate_ceiling.
               \\n Example:
               \\n If set to 2 and the input bitrate is 8000kbps. The target bitrate will be 4000kbps.`,
    },
    {
      name: 'bitrate_floor',
      type: 'string',
      defaultValue: '3000',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify the lowest output bitrate. Files will not be transcoded to a lower bitrate. Must be set lower than
               \\n Rate is in kbps. Make sure this matches the target_resolution. [See examples here](https://www.researchgate.net/profile/Denis-Rosario/publication/322644028/figure/tbl1/AS:670401042591763@1536847472503/Resolution-and-Bitrate-Configurations.png)
               \\n Leave empty to disable.
                    \\nExample:\\n
                    3000`,
    },
    {
      name: 'bitrate_ceiling',
      type: 'string',
      defaultValue: '6000',
      inputUI: {
        type: 'text',
      },
      tooltip: `Specify the highest output bitrate. Files with a lower target bitrate will target this value.
               \\n Rate is in kbps. Make sure this matches the target_resolution. [See examples here](https://www.researchgate.net/profile/Denis-Rosario/publication/322644028/figure/tbl1/AS:670401042591763@1536847472503/Resolution-and-Bitrate-Configurations.png)
               \\n Leave empty to disable.
                    \\nExample:\\n
                    6000`,
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
    {
      name: 'force_conform',
      type: 'boolean',
      defaultValue: true,
      inputUI: {
        type: 'dropdown',
        options: [
          'false',
          'true',
        ],
      },
      tooltip: `Make the file conform to output containers requirements.
                \\n Drop hdmv_pgs_subtitle/eia_608/subrip/timed_id3 for MP4.
                \\n Drop data streams/mov_text/eia_608/timed_id3 for MKV.
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

  let bitrate_floor = Number(iDnputs.bitrate_floor);
  let bitrate_ceiling = Number(inputs.bitrate_ceiling);

  if (bitrate_ceiling <= bitrate_floor) {
    response.infoLog += 'bitrate_ceiling must be greater than the bitrate_floor.';
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

  // Set up required variables.
  let videoIdx = 0;
  let CPU10 = false;
  let extraArguments = '-vf scale=-1:1080 ';
  let genpts = '';
  let bitrateSettings = '';
  // Work out currentBitrate using "Bitrate = file size / (number of minutes * .0075)"
  // Used from here https://blog.frame.io/2017/03/06/calculate-video-bitrates/
  // eslint-disable-next-line no-bitwise
  const currentBitrate = ~~(file.file_size / (duration * 0.0075));
  // Use the same calculation used for currentBitrate but divide it in half to get targetBitrate.
  // Logic of h265 can be half the bitrate as h264 without losing quality.
  // eslint-disable-next-line no-bitwise

  var targetBitrate = ~~(file.file_size / (duration * 0.0075) / Number(inputs.bitrate_scaledown_factor));
  response.infoLog += `Downscaling bitrate by a factor of ${inputs.bitrate_scaledown_factor}x from ${currentBitrate} kbps to proposed bitrate of ${targetBitrate} kbps.\n`;

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

  // Allow some leeway under and over the targetBitrate.
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

  // Check if inputs.bitrate cutoff has something entered.
  // (Entered means user actually wants something to happen, empty would disable this).
  if (inputs.bitrate_cutoff !== '') {
    // Checks if currentBitrate is below inputs.bitrate_cutoff.
    // If so then cancel plugin without touching original files.
    if (currentBitrate <= inputs.bitrate_cutoff) {
      response.processFile = false;
      response.infoLog += `Current bitrate is below set cutoff of ${inputs.bitrate_cutoff}. Cancelling plugin. \n`;
      return response;
    }
  }

  // Check if force_conform option is checked.
  // If so then check streams and add any extra parameters required to make file conform with output format.
  if (inputs.force_conform === true) {
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
      // Check if codec of stream is hevc or vp9 AND check if file.container matches inputs.container.
      // If so nothing for plugin to do.
      response.infoLog += `========== Source Details: ==========\n`;
      response.infoLog += `Height: ${height} px\n`;
      response.infoLog += `Width: ${width} px\n`;
      response.infoLog += `Codec: ${codec_name}\n`;
      response.infoLog += `Bitrate: ${currentBitrate} kbps \n`;
      response.infoLog += `===============================\n`;
      if (
          (
              codec_name === 'hevc' || codec_name === 'vp9'
          )
          // && file.container === inputs.container
          && (height === 1080 || width === 1920)
          && currentBitrate <= bitrate_ceiling
          && currentBitrate >= bitrate_floor
      ) {
        response.processFile = false;
        response.infoLog += `Success conditions have all been met. Skipping transcoding for this file...\n`;
        return response;
      }

      let t = '✅';
      let f = '❌';

      response.infoLog += `Success conditions have not been met yet. Transcoding...\n`;
      response.infoLog += `  ${(codec_name === 'hevc' || codec_name === 'vp9' ? t : f)} Uses HVEC or vp9\n`;
      response.infoLog += `  ${(height === 1080 || width === 1920 ? t : f)} Resolution is 1080p\n`;
      response.infoLog += `  ${(currentBitrate <= bitrate_ceiling ? t : f)} Bitrate is lower than ceiling\n`;
      response.infoLog += `  ${(currentBitrate >= bitrate_floor ? t : f)} Bitrate is higher than floor\n`;

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
  response.infoLog += `Ceiling: ${bitrate_ceiling} kbps \n`;
  response.infoLog += `Maximum: ${maximumBitrate} kbps \n`;
  response.infoLog += `Target: ${targetBitrate} kbps \n`;
  response.infoLog += `Minimum: ${minimumBitrate} kbps \n`;
  response.infoLog += `Floor: ${bitrate_floor} kbps \n`;
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