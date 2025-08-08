/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
  id: 'Tdarr_Plugin_MC93_CrocoKyle1FFMPEG',
  Stage: 'Pre-processing',
  Name: 'CrocoKyles Transcode via Nvidia GPU',
  Type: 'Video',
  Operation: 'Transcode',
  Description: `Files not in HEVC will be transcoded to HEVC using an Nvidia GPU through ffmpeg.
                All files not in the target quality profile will either be upscaled or downscaled to fit this resolution.
                This is a rewrite of Migz Transcode Using Nvidia GPU & FFMPEG.`,
  Version: '1.0.1',
  Tags: 'pre-processing,ffmpeg,video only,nvenc h265,configurable',
  Inputs: [
    {
      name: 'resolution',
      type: 'string',
      defaultValue: '1080p',
      inputUI: {
        type: 'dropdown',
        options: [
          '360p',
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
      name: 'quality',
      type: 'string',
      defaultValue: 'Medium',
      inputUI: {
        type: 'dropdown',
        options: [
          'Auto (Lossless)',
          'High',
          'Medium',
          'Low',
        ],
      },
      tooltip: `Specify the output quality. This adjusts the CRF values that ffmpeg uses to determine bitrate. Medium should generally reduce video size. High may maintain or slightly increase size.`
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
                \\n mkv is recommended.`
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
      tooltip: `Specify if output file should be 10bit. Default is false.`
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
                 \\n Default is false.`
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

  let quality_map = {
    'Auto': 0,
    'High': 0,
    'Medium': 1,
    'Low': 2
  }
  // Quality profiles map the option to standard 16:9 resolutions and their respective bitrate.
  // Aspect ratios are not hardcoded, but these are used to determine whether a video matches the target profile.
  // The third value in the arrays are the target CRF values to be used by ffmpeg.
  let crf_dropdown_factor = quality_map[inputs.quality];
  response.infoLog += `CRF Dropdown: ${crf_dropdown_factor}\n`
  let resolution_profiles = {
    '360p': [360, 640, 35],
    '480p': [480, 720, 33],
    '720p': [720, 1280, 30],
    '1080p': [1080, 1920, 29],
    '2k': [1440, 2560, 27],
    '4k': [2160, 3840, 26],
  }
  const [chosen_height, chosen_width, starting_crf] = resolution_profiles[inputs.resolution];
  
  let chosen_crf = starting_crf + quality_map[inputs.quality]
  if (inputs.quality == 'Auto') {
    chosen_crf = 0
  }
  
  response.infoLog += `CRF: ${chosen_crf}\n`;
  let videoIdx = 0;
  let CPU10 = false;
  let extraArguments = ``;
  if (!isNaN(chosen_crf)) {
    extraArguments += `-cq:v ${chosen_crf} `
  }
  let genpts = '';

  // If Container .ts or .avi set genpts to fix unknown timestamp
  if (inputs.container.toLowerCase() === 'ts' || inputs.container.toLowerCase() === 'avi') {
    genpts = '-fflags +genpts';
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
      response.infoLog += `Container: ${file.container}\n`;
      response.infoLog += `===============================\n`;

      function generateConditionLog(condition, description) {
        return `  ${condition ? '✅' : '❌'} ${description}\n`;
      }

      // Success Conditions
      let codec_match = codec_name === 'hevc'
      let container_match = file.container === inputs.container;
      let resolution_match = width <= chosen_width || height <= chosen_height

      let conditions = [
        { condition: codec_match, description: 'Codec is HEVC' },
        { condition: container_match, description: `Container is ${inputs.container}` },
        { condition: resolution_match, description: `Resolution is ${inputs.resolution.split('@')[0].trim()}`},
      ];

      let allConditionsMet = conditions.every(item => item.condition);

      if (allConditionsMet) {
        response.processFile = false;
        response.infoLog += `Success conditions have all been met. Skipping transcoding for this file...\n`;
        return response;
      } else {
        response.infoLog += `Success conditions have not been met yet. Transcoding...\n`;
      }

      conditions.forEach(item => {
        response.infoLog += generateConditionLog(item.condition, item.description);
      });

      // Rescale if required
      if (!resolution_match) {
        extraArguments += `-vf scale=-1:${chosen_height} `
      }
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

  response.preset += `${genpts}, -map 0 -c:v hevc_nvenc `
      + `-spatial_aq:v 1 -rc-lookahead:v 32 -c:a copy -vsync 1 -c:s copy -max_muxing_queue_size 9999 ${extraArguments}`;
  response.infoLog += `Running command:\n${response.preset}`
  response.processFile = true;

  return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
