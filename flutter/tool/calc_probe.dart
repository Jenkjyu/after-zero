// ignore_for_file: avoid_print

import 'dart:convert';

import 'package:after_zero/calc/calc.dart' as c;

void main() {
  final vals = <String, List<Object?>>{
    'fmt': [0, 1, 999, 1000, 1234567.89, -1234.5, -2.5, 2.5, 2.345, 0.004, 999.6, 0],
    'money': [0, 1.5, 2.345, 1234.567, -1234.561, 0.005, 2100, -0.001, 999999.999],
    'r2': [2.345, -2.345, 2.5, -2.5, 0.005, 1.005, 1.00499999],
    'niceCeil': [0, 1, 1.2, 2.5, 9.9, 10, 11, 100, 123, 999, 0.7, 0.01],
    'rateClass': [0, 9.99, 10, 17.99, 18, 30],
    'urgencyTier': [-5, -1, 0, 3, 4, 14, 15, 100],
    'relLabel': [-5, 0, 1, 99],
    'dueBucket': [-1, 0, 7, 8, 30, 31],
  };
  final out = <String, List<Object?>>{};
  vals.forEach((key, arr) {
    out[key] = arr.map((v) {
      return switch (key) {
        'fmt' => c.fmt(v),
        'money' => c.money(v),
        'r2' => c.r2(v),
        'niceCeil' => c.niceCeil(v as num),
        'rateClass' => c.rateClass(v as num),
        'urgencyTier' => c.urgencyTier(v as int),
        'relLabel' => c.relLabel(v as int),
        'dueBucket' => c.dueBucket(v as int),
        _ => null,
      };
    }).toList();
  });
  final dates = ['2026-13-01', '2026-02-31', '2026-02-30', '2026-08-08', '2026-01-01', 'abc', ''];
  out['parseDate'] = dates
      .map((s) {
        final d = c.parseDate(s);
        return d == null ? null : c.fmtDate(d);
      })
      .toList();
  out['addMonths'] = ['2026-01-31', '2026-08-31', '2026-02-28', '2026-12-15']
      .map((s) => c.fmtDate(c.addMonths(c.parseDate(s)!, 1)))
      .toList();
  print(jsonEncode(out));
}
