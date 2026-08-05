import 'dart:io';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

typedef TemporaryDirectoryProvider = Future<Directory> Function();

class SystemFileSaver {
  static const _channel = MethodChannel('after_zero/file_save');

  final TemporaryDirectoryProvider _temporaryDirectory;
  final MethodChannel _methodChannel;

  SystemFileSaver({
    TemporaryDirectoryProvider? temporaryDirectory,
    MethodChannel? methodChannel,
  }) : _temporaryDirectory = temporaryDirectory ?? getTemporaryDirectory,
       _methodChannel = methodChannel ?? _channel;

  /// Android经真正的SAF "创建文档"选择器保存；iOS用系统分享面板（其中包含存入Files）。
  /// 两边都会先写入cache临时文件，避免将整段大二进制数据跨Activity/平台通道长期持有。
  Future<bool> saveBytes({
    required Uint8List bytes,
    required String filename,
    required String mimeType,
  }) async {
    final temp = await _writeTemp(bytes, filename);
    return _saveTemp(temp, filename, mimeType);
  }

  Future<bool> saveFile({
    required File source,
    required String filename,
    required String mimeType,
  }) async {
    final temp = await _copyTemp(source, filename);
    return _saveTemp(temp, filename, mimeType);
  }

  Future<void> shareFile(File file, {String? title}) => SharePlus.instance
      .share(ShareParams(files: [XFile(file.path)], title: title ?? file.path));

  Future<File> _writeTemp(Uint8List bytes, String filename) async {
    final dir = await _exportDirectory();
    final file = File('${dir.path}/${_safeFilename(filename)}');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<File> _copyTemp(File source, String filename) async {
    final dir = await _exportDirectory();
    return source.copy('${dir.path}/${_safeFilename(filename)}');
  }

  Future<Directory> _exportDirectory() async {
    final root = await _temporaryDirectory();
    final dir = Directory('${root.path}/after-zero-exports');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<bool> _saveTemp(File temp, String filename, String mimeType) async {
    try {
      if (Platform.isAndroid) {
        final result = await _methodChannel.invokeMapMethod<String, dynamic>(
          'save',
          {'sourcePath': temp.path, 'filename': filename, 'mimeType': mimeType},
        );
        return result?['cancelled'] != true;
      }
      // iOS没有SAF；UIActivityViewController可直接“存储到文件”，也是该平台正确的保存交互。
      await SharePlus.instance.share(
        ShareParams(files: [XFile(temp.path)], title: filename),
      );
      return true;
    } finally {
      if (!Platform.isAndroid && await temp.exists()) await temp.delete();
    }
  }

  String _safeFilename(String filename) {
    final safe = filename.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    return '${DateTime.now().microsecondsSinceEpoch}-$safe';
  }
}
