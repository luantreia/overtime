// server/controllers/partidoController.js
export const actualizarEstadisticasPartido = async (req, res) => {
  try {
    const { partidoId } = req.params;
    const { sets } = req.body; // array de sets con sus stats

    const partido = await Partido.findById(partidoId);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    partido.sets = sets;
    await partido.save();

    res.json({ message: 'Estadísticas actualizadas correctamente', partido });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar estadísticas', error: err.message });
  }
};
