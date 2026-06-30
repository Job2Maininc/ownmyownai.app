use hound::{SampleFormat, WavSpec, WavWriter};
use rubato::{FftFixedIn, Resampler};
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const WHISPER_SAMPLE_RATE: usize = 16_000;

/// Convertit un fichier audio en WAV PCM 16 kHz mono (format attendu par whisper.cpp).
pub fn convert_to_whisper_wav(input: &Path, output: &Path) -> Result<(), String> {
    let file = File::open(input).map_err(|e| format!("Ouverture audio impossible : {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = input.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Format audio non reconnu : {e}"))?;

    let mut format = probed.format;
    let (track_id, mut decoder, mut source_rate, mut channels) = {
        let track = format
            .default_track()
            .ok_or_else(|| "Aucune piste audio dans le fichier".to_string())?;

        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("Codec audio non supporté : {e}"))?;
        let source_rate = track
            .codec_params
            .sample_rate
            .unwrap_or(WHISPER_SAMPLE_RATE as u32) as usize;
        let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);
        (track.id, decoder, source_rate, channels)
    };

    let mut samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(SymphoniaError::ResetRequired) => {
                return Err("Flux audio interrompu (reset requis)".into());
            }
            Err(e) => return Err(format!("Lecture audio : {e}")),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                channels = spec.channels.count();
                source_rate = spec.rate as usize;
                let mut sample_buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                sample_buf.copy_interleaved_ref(decoded);
                samples.extend_from_slice(sample_buf.samples());
            }
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("Décodage audio : {e}")),
        }
    }

    if samples.is_empty() {
        return Err("Aucun échantillon audio décodé".into());
    }

    let mono = downmix_to_mono(&samples, channels);
    let resampled = if source_rate == WHISPER_SAMPLE_RATE {
        mono
    } else {
        resample_to_16k(&mono, source_rate)?
    };

    write_wav(output, &resampled)?;
    Ok(())
}

fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let frames = samples.len() / channels;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let start = frame * channels;
        let sum: f32 = samples[start..start + channels].iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

fn resample_to_16k(samples: &[f32], source_rate: usize) -> Result<Vec<f32>, String> {
    if samples.is_empty() {
        return Ok(vec![]);
    }
    let chunk_size = 1024.min(samples.len().max(1));
    let mut resampler = FftFixedIn::<f32>::new(
        source_rate,
        WHISPER_SAMPLE_RATE,
        chunk_size,
        1,
        1,
    )
    .map_err(|e| format!("Resampling impossible : {e}"))?;

    let mut out = Vec::new();
    let mut offset = 0usize;
    while offset < samples.len() {
        let end = (offset + chunk_size).min(samples.len());
        let chunk = &samples[offset..end];
        let padded = if chunk.len() < chunk_size {
            let mut p = chunk.to_vec();
            p.resize(chunk_size, 0.0);
            p
        } else {
            chunk.to_vec()
        };
        let waves_in = vec![padded];
        let waves_out = resampler
            .process(&waves_in, None)
            .map_err(|e| format!("Resampling : {e}"))?;
        if let Some(channel) = waves_out.first() {
            out.extend_from_slice(channel);
        }
        offset = end;
    }
    Ok(out)
}

fn write_wav(path: &Path, samples: &[f32]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let spec = WavSpec {
        channels: 1,
        sample_rate: WHISPER_SAMPLE_RATE as u32,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let int_sample = (clamped * i16::MAX as f32) as i16;
        writer.write_sample(int_sample).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}
